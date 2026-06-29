# CareerOS Backend — Milestone 3: Skills Database + Gap Analysis + Roadmap Generation

**Scope:** Seeded skills taxonomy (500+ skills / 10 categories), target-role requirement profiles, semantic gap calculation (resume skills vs. role requirements), AI-generated month-by-month roadmaps, roadmap progress tracking, and dynamic regeneration on goal/skill-level change — built on the M1 (auth/onboarding) and M2 (resume engine) foundation. Per SRS FR-4.

**Builds directly on M1 + M2.** Reuses: `authenticate` middleware, `pool.ts` query helpers, `rateLimiter` factory, `errorHandler`, `logger`, migration runner, the provider-agnostic AI interface from `src/lib/ai/` (Gemini 2.5 Flash default, OpenAI fallback), the `resumes.parsed_data` JSONB (skills array), `users.career_goals` / `skill_level`, and the `role_keywords` stub table from M2 (migration 009) — which M3 supersedes with a richer schema.

**Status: PLANNED — not yet implemented.** This guide is the build spec for M3, written against the M1/M2 codebase as it actually exists today. Section numbering mirrors the M1/M2 guides so the three documents read as one series.

---

## 1. Architecture decisions (proposed)

| Concern | Decision | Why |
|---|---|---|
| Skills taxonomy storage | New `skills` table (replaces M2's flat `role_keywords` stub) with `category`, `aliases text[]` for fuzzy matching | SRS FR-4.1 — needs ≥500 skills across 10 categories, queryable by category |
| Role requirements | New `role_requirements` table: `role_name`, `skill_id` FK, `importance_weight`, `min_proficiency` | SRS FR-4.2 — sourced from JD analysis, minimum 50 JDs/role; M3 ships with curated seed data, JD-scraping pipeline is a later milestone |
| Gap calculation | Two-stage: (1) **exact match** on skill name/alias between `resumes.parsed_data.skills` and `role_requirements`, (2) **semantic fallback** via pgvector cosine similarity for skills that don't exact-match (synonyms, near-equivalents) | FR-4.3 says "semantic matching" — pure string match misses "JS" vs "JavaScript"; pgvector (already provisioned since M1) avoids a second exact/fuzzy library |
| Skill embeddings | Generated once per skill at seed time, stored in `skills.embedding vector(768)`, via the existing AI provider's embedding endpoint (Gemini `text-embedding-004` or OpenAI `text-embedding-3-small` depending on `AI_PROVIDER`) | Reuses M2's provider-agnostic pattern instead of hardcoding one embedding API |
| Roadmap generation | LLM call (same `ResumeParserService`-style interface, new `RoadmapGeneratorService`) given: target role, current skills, missing skills sorted by (importance, est. learning time), hours/week | FR-4.4/4.5 — structured JSON output, `responseMimeType`/`response_format` forced JSON exactly as M2 does for resume parsing |
| Roadmap storage | `roadmaps` table (one active per user per target role) + `roadmap_items` table (one row per month/topic, normalized — not a JSONB blob) | Normalizing lets the FE patch individual item completion (`PATCH /roadmap/items/:id/complete`) without rewriting the whole JSON document, and lets "career score" triggers (M2 dimension recompute) listen on a single-row UPDATE |
| Resource links | Each `roadmap_items` row carries `resources JSONB` — array of `{type: 'doc'|'video'|'course', url, title, isAffiliate}` | FR-4.6/4.7 — keeps affiliate-link logic (M3 stub: a static `AFFILIATE_TAG` query-param appender; real affiliate program is a later milestone) out of the schema, in service code |
| Regeneration trigger | Roadmap regenerates when `users.career_goals` or `users.skill_level` changes — detected via a service-layer check on the onboarding/profile-update path (M1's `onboarding.service.ts`), not a DB trigger | Keeping business logic in TS, not Postgres triggers, matches the project's no-ORM/no-magic philosophy from M1 |
| PDF export | Deferred — `GET /api/roadmap/:id/export.pdf` stubbed to return `501 Not Implemented` | FR-4.10 is Premium-only and needs a PDF rendering decision (e.g. `@react-pdf/renderer` vs. Puppeteer); out of scope for M3, tracked for M4 |
| Validation | Zod, same pattern as M1/M2 | Consistency |
| Job queue | Roadmap generation runs **synchronously** in the request (LLM call ~3-8s), not via BullMQ | Unlike resume parsing (which involves file I/O + extraction + parsing, justifying a queue), roadmap gen is a single LLM call; SSE/polling overhead isn't worth it yet. Revisit if p95 latency becomes a problem (NFR-1 doesn't set a target for this specific endpoint) |

### Key deviations from the original SRS flow

- **FR-4.2 "minimum 50 JDs per role"** — no JD-scraping/ingestion pipeline exists yet (that's the Job Matching milestone, FR-6 / SRS §3.6). M3 ships `role_requirements` with **hand-curated seed data** for a fixed initial set of target roles (SDE, Data Analyst, Frontend Developer, Backend Developer, ML Engineer — expandable via the seed script). The schema is shaped so a future JD-ingestion job can populate it the same way without migration changes.
- **`role_keywords` (M2, migration 009) is superseded, not extended.** M2 left it as an unseeded stub for ATS keyword matching. M3 introduces the richer `skills` + `role_requirements` schema and **migrates `role_keywords` data into `skills`** in migration 010, then has `scoring.service.ts` (M2) read from `skills`/`role_requirements` for the ATS Compatibility dimension going forward. `role_keywords` table is dropped in migration 013 once the read path is confirmed switched over.
- **Semantic matching is two-stage, not pure-LLM.** Asking an LLM "does the user have skill X" for every skill in a role's requirement list would be slow and non-deterministic. Exact/alias match first (fast, free), pgvector cosine similarity second (catches synonyms), LLM only as a last-resort tie-breaker for ambiguous cases — kept optional behind a feature flag (`GAP_ANALYSIS_LLM_TIEBREAK=false` by default) since it adds latency and cost for marginal accuracy gain at this stage.
- **No real affiliate program integration.** FR-4.7 ("affiliate links applied to paid course recommendations") is stubbed as a config-driven URL param appender (`?ref=careeros`), not a real affiliate network integration (Amazon Associates / Udemy partner API, etc.) — that requires business-side account setup outside this milestone's scope.

---

## 2. Files to be created (additions to existing structure)

```
src/
├── lib/
│   └── ai/
│       ├── embeddings.interface.ts     # EmbeddingService interface (provider-agnostic, mirrors resume-parser.interface.ts)
│       ├── gemini-embeddings.provider.ts
│       ├── openai-embeddings.provider.ts
│       └── roadmap-generator.interface.ts  # RoadmapGeneratorService interface + RoadmapPlan type
├── modules/
│   ├── skills/
│   │   ├── skills.routes.ts        # Read-only browse endpoints (category listing, search)
│   │   ├── skills.controller.ts
│   │   ├── skills.service.ts
│   │   └── skills.repository.ts    # Raw SQL: category filters, alias search, embedding lookups
│   ├── gap-analysis/
│   │   ├── gap.routes.ts
│   │   ├── gap.controller.ts
│   │   ├── gap.service.ts          # Orchestrates exact-match → pgvector fallback → (optional) LLM tiebreak
│   │   └── gap.repository.ts
│   └── roadmap/
│       ├── roadmap.routes.ts       # 7 endpoints, all JWT-protected
│       ├── roadmap.controller.ts
│       ├── roadmap.service.ts      # Orchestration: gap fetch → LLM generate → persist → regen-on-change
│       ├── roadmap.repository.ts   # Raw SQL for roadmaps + roadmap_items
│       └── roadmap.validators.ts   # Zod schemas
├── db/migrations/
│   ├── 010_create_skills.sql                 # + migrates role_keywords data in
│   ├── 011_create_role_requirements.sql
│   ├── 012_create_roadmaps_and_items.sql
│   └── 013_drop_role_keywords.sql            # run only after scoring.service.ts cutover verified
└── scripts/
    └── seed-skills.ts             # Seeds 500+ skills, 10 categories, role_requirements for 5 initial roles

tests/
├── gap-analysis.test.ts           # Unit tests: exact match, alias match, pgvector fallback (mocked embeddings)
└── roadmap.test.ts                # Integration tests (mock AI provider, real DB)
```

---

## 3. Database schema (migrations 010–012)

### `skills`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK, default gen_random_uuid() | |
| name | VARCHAR(255), UNIQUE, NOT NULL | Canonical name, e.g. "React" |
| category | VARCHAR(100), NOT NULL | One of 10 categories (Languages, Frontend, Backend, DevOps, DSA, etc.) |
| aliases | TEXT[], DEFAULT '{}' | e.g. `{'ReactJS', 'React.js'}` for exact-match fallback before embedding lookup |
| embedding | vector(768), nullable | Generated at seed time; nullable so seeding can run before embedding backfill if an AI provider key is briefly unavailable |
| description | TEXT, nullable | Short blurb, shown in roadmap UI |
| created_at | TIMESTAMP, DEFAULT NOW() | |

Indexes: `UNIQUE(name)`, `GIN(aliases)`, and an HNSW/IVFFlat index on `embedding` (pgvector) for cosine similarity search.

### `role_requirements`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| role_name | VARCHAR(255), NOT NULL | e.g. 'SDE', 'Data Analyst' — matched against `users.career_goals` entries |
| skill_id | UUID FK → skills.id, CASCADE | |
| importance_weight | NUMERIC(3,2), DEFAULT 1.0 | 0–1, used for sorting missing skills (FR-4.3 step 1) |
| min_proficiency | ENUM('beginner','mid','advanced'), DEFAULT 'beginner' | Minimum level the role expects |
| est_learning_hours | INTEGER, nullable | Used for FR-4.3 step 2 sort + roadmap month-allocation |

Indexes: `(role_name, skill_id)` unique, `(role_name)` for the gap-calculation lookup.

### `roadmaps`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users.id, CASCADE | |
| target_role | VARCHAR(255), NOT NULL | |
| hours_per_week | INTEGER, NOT NULL | User-provided at generation time |
| status | ENUM('active','superseded'), DEFAULT 'active' | Regeneration marks old roadmap `superseded` rather than deleting (history) |
| generated_from_skill_level | ENUM('beginner','mid','advanced'), NOT NULL | Snapshot — detects staleness if `users.skill_level` later diverges |
| created_at | TIMESTAMP, DEFAULT NOW() | |

Partial unique index: one `status = 'active'` roadmap per `(user_id, target_role)`.

### `roadmap_items`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| roadmap_id | UUID FK → roadmaps.id, CASCADE | |
| month_number | INTEGER, NOT NULL | 1-indexed |
| topic | VARCHAR(255), NOT NULL | |
| skill_id | UUID FK → skills.id, nullable | Nullable — some roadmap topics are broader than one taxonomy skill |
| resources | JSONB, NOT NULL | `[{type, url, title, isAffiliate}]`, min 3 per FR-4.5 |
| project_assignment | TEXT, nullable | |
| estimated_hours | INTEGER, nullable | |
| is_complete | BOOLEAN, DEFAULT false | User-toggled (FR-4.8) |
| completed_at | TIMESTAMP, nullable | |

Index: `(roadmap_id, month_number)`.

---

## 4. API contract (proposed)

All endpoints require `Authorization: Bearer <accessToken>` unless noted.

### Skills (read-only browse)
| Method | Endpoint | Query | Purpose |
|---|---|---|---|
| GET | `/api/skills` | `?category=&search=` | Browse/search taxonomy (FE autocomplete, e.g. onboarding step 2/3) |
| GET | `/api/skills/categories` | — | List the 10 categories with counts |

### Gap Analysis
| Method | Endpoint | Body / Query | Purpose |
|---|---|---|---|
| GET | `/api/gaps/:userId` | `?targetRole=` | Per SRS §2.3. Returns `{ currentSkills, missingSkills: [{skill, importance, estLearningHours}], matchPercent }` |

### Roadmap
| Method | Endpoint | Body | Status | Purpose |
|---|---|---|---|---|
| POST | `/api/roadmap/generate` | `{ targetRole, hoursPerWeek }` | 201 | Per SRS §2.3 — runs gap analysis, calls LLM, persists, marks prior roadmap for that role `superseded` |
| GET | `/api/roadmap/:userId` | `?targetRole=` | 200 | Active roadmap for user (+role if multiple) |
| GET | `/api/roadmap/detail/:roadmapId` | — | 200 | Full roadmap with all items |
| PATCH | `/api/roadmap/items/:itemId/complete` | `{ isComplete: boolean }` | 200 | FR-4.8 — toggles completion, triggers career-score recompute hook (M2 dimension update) |
| POST | `/api/roadmap/:roadmapId/regenerate` | `{ hoursPerWeek? }` | 201 | Manual regen trigger (FE "Regenerate" button) — same path the automatic goal/skill-level-change hook uses internally |
| GET | `/api/roadmap/:roadmapId/export.pdf` | — | 501 | Stubbed for M4. Returns `{ error: { code: 'NOT_IMPLEMENTED' } }` |

### Generation flow

```
Client                      API                      Postgres                  AI Provider
  │  POST /generate          │                          │                          │
  │ ───────────────────────► │                          │                          │
  │                          │  fetch user career_goals, │                          │
  │                          │  skill_level, resume      │                          │
  │                          │  parsed_data.skills        │                          │
  │                          │ ─────────────────────────► │                          │
  │                          │ ◄───────────────────────── │                          │
  │                          │                          │                          │
  │                          │  gap.service: exact match │                          │
  │                          │  → pgvector fallback →     │                          │
  │                          │  missingSkills[] sorted   │                          │
  │                          │                          │                          │
  │                          │  build roadmap prompt     │                          │
  │                          │ ──────────────────────────────────────────────────► │
  │                          │ ◄────────────────────────────────────────────────── │
  │                          │  (forced JSON response)   │                          │
  │                          │                          │                          │
  │                          │  mark prior roadmap        │                          │
  │                          │  superseded, insert new   │                          │
  │                          │  roadmap + items rows     │                          │
  │                          │  (single transaction)     │                          │
  │                          │ ─────────────────────────► │                          │
  │ ◄─────────────────────── │ 201 { roadmap }            │                          │
```

---

## 5. Gap Analysis logic (`gap.service.ts`)

Three-stage resolution per skill the role requires:

| Stage | Method | Cost | Catches |
|---|---|---|---|
| 1 | Exact match: `resumes.parsed_data.skills` entries vs. `skills.name` / `skills.aliases` (case-insensitive) | Free, instant | "React" = "React" |
| 2 | pgvector cosine similarity (`embedding <=> embedding`, threshold configurable, default 0.85) between unmatched resume skills and unmatched required skills | One embedding call per unmatched resume skill (batched), then in-DB vector search | "ReactJS" ≈ "React" (if not already in aliases), "Postgres" ≈ "PostgreSQL" |
| 3 (optional, flagged off by default) | LLM tie-break for anything still ambiguous after stage 2 | One LLM call per gap-analysis run (not per skill) — batched into a single prompt listing remaining ambiguous pairs | Edge cases like "built REST APIs" implying "API Design" without the literal string anywhere |

`missingSkills[]` sorted by `importance_weight DESC, est_learning_hours ASC` — matches FR-4.3's stated priority order (importance first, then learning time as tiebreaker).

**Match percent** = `(requiredSkillsCount - missingSkillsCount) / requiredSkillsCount * 100`, rounded.

---

## 6. Roadmap generation (`roadmap.service.ts`)

- **Prompt construction:** current skill level, target role, hours/week, and the sorted `missingSkills[]` from gap analysis — same provider-agnostic call pattern as M2's resume parser (forced JSON, `RoadmapGeneratorService` interface swappable between Gemini/OpenAI via `AI_PROVIDER`).
- **Month allocation:** number of roadmap months is **not** purely LLM-decided — service code caps it at `ceil(totalEstLearningHours / (hoursPerWeek * 4))`, capped at 12 months, and passes that number into the prompt as a hard constraint, so the LLM doesn't invent unrealistic 3-month plans for a 5-hours/week user with 400 hours of missing skills.
- **Validation:** LLM JSON response is Zod-validated against a strict `RoadmapPlanSchema` (min 3 resources per month per FR-4.5, all months present, no skipped `month_number`) before being persisted. On validation failure: one retry with a stricter "you MUST return exactly this shape" follow-up prompt; on second failure, `500` with a logged raw response for debugging (never shown to user).
- **Regeneration:** `POST /roadmap/:id/regenerate` and the automatic profile-change hook both call the same internal `regenerateRoadmap()` — old roadmap row flips to `status = 'superseded'`, a fresh one is generated. Completed items are **not** carried over automatically in M3 (the new roadmap starts clean); carrying forward completed-skill credit across regenerations is noted as a v2 improvement below.

---

## 7. Security & rate limiting (proposed)

- **Roadmap generation rate limit:** `POST /roadmap/generate` and `/regenerate` limited to 5/hour/user (Redis, same factory as M1) — LLM calls are the expensive resource here, not request volume.
- **Skills browse endpoints are public-read but still require JWT** (consistent with "all endpoints except `/auth/*` require valid JWT" — SRS FR-1.10), even though the data itself isn't sensitive; avoids carving out a new auth exception.
- **No PII in roadmap prompts beyond what's already in `resumes.parsed_data`** (skills/projects/education — already covered by M2's "PII not logged at info level" policy, extended to roadmap-service logs).

---

## 8. Test coverage (planned)

### `tests/gap-analysis.test.ts` (unit — mocked embeddings, no live AI calls)
| Test | Covers |
|---|---|
| Exact match resolves missing skills correctly | FR-4.3 stage 1 |
| Alias match resolves "ReactJS" → "React" | FR-4.3 stage 1 |
| pgvector fallback resolves near-synonym pair above threshold | FR-4.3 stage 2 |
| Below-threshold pair remains in missingSkills | FR-4.3 stage 2 boundary |
| Sort order: importance desc, then learning hours asc | FR-4.3 step 1+2 |
| Match percent calculation | API contract |

### `tests/roadmap.test.ts` (integration — mock AI provider, real DB)
| Test | Covers |
|---|---|
| Generate roadmap — valid response persisted across roadmap + roadmap_items | FR-4.4/4.5 |
| Month count respects hoursPerWeek cap | Service logic |
| Malformed LLM JSON triggers retry, then persists corrected shape | Resilience |
| Mark item complete — `completed_at` set | FR-4.8 |
| Regenerate — prior roadmap marked superseded, new one active | FR-4.9 |
| 401 without auth token | Security |
| Rate limit enforced on generate endpoint | Security |
| Export endpoint returns 501 | Stub correctness |

---

## 9. Environment variables to add

```
# Embeddings (for gap-analysis semantic matching)
EMBEDDING_PROVIDER=gemini          # mirrors AI_PROVIDER pattern from M2
GEMINI_EMBEDDING_MODEL=text-embedding-004
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Gap analysis tuning
GAP_SEMANTIC_MATCH_THRESHOLD=0.85
GAP_ANALYSIS_LLM_TIEBREAK=false    # opt-in, off by default

# Roadmap generation
ROADMAP_MAX_MONTHS=12
ROADMAP_GENERATE_RATE_LIMIT_PER_HOUR=5

# Affiliate link stub
AFFILIATE_REF_TAG=careeros
```

---

## 10. Scripts to add

```json
"seed:skills": "tsx scripts/seed-skills.ts"
```

`seed-skills.ts` will: insert ~500 skills across 10 categories (Languages, Frontend, Backend, Databases, DevOps/Cloud, DSA & CS Fundamentals, Mobile, AI/ML, Soft Skills, Tools), backfill embeddings for each via the configured `EMBEDDING_PROVIDER`, then insert curated `role_requirements` rows for the 5 initial target roles.

---

## 11. Known risks / open decisions before build

- **Embedding backfill cost/time:** ~500 skills × 1 embedding call each at seed time. Cheap individually, but worth batching (most embedding APIs support batch input) rather than 500 sequential calls.
- **`role_requirements` seed data is opinion, not data-derived** — FR-4.2's "minimum 50 JDs per role" isn't satisfied yet. This is a known gap versus the SRS, explicitly deferred (see deviations above), not an oversight.
- **Carrying progress across regeneration:** if a user completes 3 months of a roadmap then changes their target role, those 3 months of credit currently disappear (new roadmap starts at item-level `is_complete = false` for everything). Whether completed *skills* (not roadmap items) should pre-populate as "already have" in the next gap analysis is an open product question, not just an engineering one — flagging for a decision before FE builds against `POST /regenerate`.
- **LLM tie-break (stage 3) cost if ever flipped on:** batching ambiguous pairs into one prompt keeps it to one call per gap-analysis run, but no caching layer exists yet (unlike M2's mentor-response 24hr cache pattern) — worth adding if the flag gets turned on in practice.

---

## 12. What M3 does NOT include (deferred)

- JD scraping/ingestion pipeline to satisfy the "50 JDs per role" sourcing requirement — later milestone, likely bundled with Job Matching (FR-6)
- Roadmap PDF export (FR-4.10) — M4
- Real affiliate network integration (FR-4.7) — stub only, pending business-side setup
- Carrying completed-skill credit across roadmap regeneration — open product decision, not yet scheduled
- LLM tie-break stage enabled by default, plus a response cache for it — deferred until needed
- AI Mentor (FR-5) and Mock Interviews (FR-6) — separate milestones per SRS §3.4/3.5
