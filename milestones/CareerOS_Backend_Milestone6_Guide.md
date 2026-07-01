# CareerOS Backend — Milestone 6: Job Matching

**Scope:** Nightly job-ingestion pipeline, JD embedding + pgvector-based semantic matching against a user's profile, score-gated match unlock (resume score ≥ 70), preference filtering, AI-powered resume tailoring per job, and application status tracking. Per SRS §2.3 (`GET /api/jobs/matches`) and flow §3.6.

**Builds directly on M1 + M2 + M3 + M4 + M5.** Reuses: `authenticate` middleware, `pool.ts` query helpers, `rateLimiter` factory, `errorHandler`, `logger`, migration runner, BullMQ (M2's resume-parsing queue infra, extended here with a **repeatable/cron** job rather than the one-shot jobs M2 used), the provider-agnostic AI interface in `src/lib/ai/` (embeddings sub-interface from M3, parsing-style extraction from M2, generation from M2/M3), `skills`/`role_requirements`/pgvector setup from M3 (the gap-analysis engine is generalized here rather than rebuilt), `resumes.ats_score` (M2's composite score, now consumed as the ≥ 70 unlock gate), and `resumes.parsed_data` (skills/projects/experience — the source text for the tailoring feature).

**Status: PLANNED — not yet implemented.** This guide is the build spec for M6, written against the M1–M5 codebase as it actually exists today.

**Note on scope boundary:** M4's closing section deferred Job Matching to M6 (mislabeled there as "FR-6 in SRS flow numbering" — the SRS's FR checklist actually stops at FR-6/Mock Interviews; Job Matching has no numbered FR section of its own, only the flow §3.6 narrative and the one API row in §2.3. This guide treats flow §3.6's eight steps as the spec of record in the absence of an FR checklist, the same way M3 treated the SRS's roadmap flow narrative as authoritative alongside its FR-4 checklist.

---

## 1. Architecture decisions (proposed)

| Concern | Decision | Why |
|---|---|---|
| Job sourcing | **Deviates from the literal SRS wording.** Rather than scraping LinkedIn and Naukri directly, ingestion uses official/partner APIs where they exist (Indeed Publisher API, Wellfound's API) and treats LinkedIn/Naukri as **out of scope for automated ingestion** in M6, pending a legal/ToS review | See "Key deviations" below — this is a real risk, not a style preference, and is called out explicitly rather than quietly implemented against the letter of the SRS |
| Match computation | **Computed on-demand per request** via a pgvector cosine-similarity query, not precomputed and stored per user | Preferences (location, company type) and the user's active resume can both change between nightly runs; a precomputed per-user match table would need its own invalidation logic on every preference or resume change. An indexed on-demand pgvector query is fast enough (same pattern M3 already uses for skill-gap similarity) that precomputation isn't needed to hit reasonable latency |
| Match caching | Redis, key `jobs:matches:{userId}:{sha256(preferencesHash)}`, 1h TTL | Cheap insurance against repeated identical requests (e.g. a user refreshing the matches page) without the staleness risk of a longer-lived or nightly-precomputed cache |
| User profile vector | A single **profile embedding** stored on the `resumes` row (`profile_embedding`), computed once when a resume becomes active (reusing M3's embedding service on a synthesized "skills + target role" text block), not recomputed per job-match request | Matches M3's existing pattern of embedding at write-time (when a resume is parsed) rather than at read-time (every match query) — avoids one embedding-API call per matches request |
| Job requirement extraction | At ingestion time, each JD is run through the same LLM-extraction pattern M2 uses for resume parsing (forced JSON, Zod-validated, 1 retry) to produce a structured skill list, then fuzzy-matched to the `skills` table using M3's exact-match → pgvector fallback — stored in a new `job_skills` join table mirroring `role_requirements`' shape | Reuses M3's gap-analysis engine almost as-is: a job posting's extracted skill list is architecturally the same kind of "target requirements" row `role_requirements` already represents for curated roles, just sourced from a JD instead of hand-curated |
| Threshold gate | `GET /api/jobs/matches` checks `resumes.ats_score >= 70` on the user's **active** resume before running any match query | SRS flow §3.6 step 1 — explicit unlock condition; checked first so an under-70 user gets a clear "raise your score" response instead of spending a pgvector query on someone who can't act on the result anyway |
| Resume tailoring | `POST /jobs/:jobId/tailor-resume` generates a new, **non-active** `resumes`-adjacent record (new `tailored_resumes` table, not a mutation of the original) via one LLM call: base resume `parsed_data` + target JD text → rewritten sections | A separate table (rather than overloading `resumes` with a `tailored_for_job_id` nullable column) keeps M2's resume-versioning semantics ("one active per user") clean — a tailored resume is a derived artifact tied to a specific job, not a new version competing for "active" status |
| Application tracking | New `job_applications` table, user-driven status transitions (`applied → interview → offer/rejected`), no automated status detection | SRS flow §3.6 step 8 — "user applies externally; can track status... in CareerOS." Nothing in the flow implies automated tracking (e.g. email-parsing for interview invites), so this is manual status updates only, matching what's actually specified |
| Ingestion scheduling | BullMQ **repeatable job** (`repeat: { pattern: '0 2 * * *' }`, 2am daily), separate queue from M2's resume-parsing queue | SRS flow §3.6 step 2 — "background job runs nightly." BullMQ already supports cron-style repeatable jobs, so no new scheduling infra (e.g. a separate cron service) is needed beyond what M2 introduced |
| Stale listing cleanup | Jobs not seen in the current ingestion run are marked `is_active = false`, never hard-deleted | Preserves `job_applications` referential integrity — a user's application history shouldn't break because the posting was later removed from the source |
| Validation | Zod, same pattern as M1–M5 | Consistency |

### Key deviations from the original SRS flow

- **LinkedIn/Naukri scraping is not implemented as literally described.** Both platforms' Terms of Service prohibit automated scraping of listings, and LinkedIn in particular has pursued legal action over exactly this (e.g. the long-running *hiQ Labs v. LinkedIn* litigation, and LinkedIn's active anti-scraping enforcement since). Building an automated scraper against either platform creates real legal exposure for CareerOS as a company, independent of technical feasibility. M6 ships ingestion against **Indeed's Publisher API and Wellfound's API** (both of which offer sanctioned programmatic access), with LinkedIn/Naukri coverage deferred pending either (a) a legitimate partner/affiliate data agreement, or (b) user-pasted-JD-only support (see below) as a stopgap. This is flagged as a product decision to confirm, not silently substituted.
- **A user-paste fallback is included precisely because of the above.** Since two of the four named sources aren't safely ingestible automatically, `POST /jobs/manual` (see §4) lets a user paste a JD URL/text from any source — including LinkedIn/Naukri — for one-off tailoring and match-scoring against their own profile, without CareerOS itself scraping or storing that listing in the shared `jobs` table for other users. This keeps the "tailor resume for a specific JD" value (step 7) available even where bulk ingestion isn't.
- **No real-time job-market scraping; nightly batch only**, exactly as SRS step 2 specifies — called out only because "job matching" can sound like it implies live search; it does not here, matches are always against the last nightly ingestion snapshot.
- **Match percentage is a normalized cosine-similarity score, not a literal keyword-overlap percentage** — consistent with how M3's roadmap gap-analysis already treats "match %," reusing the same normalization approach rather than inventing a second definition of "match %" in the same codebase.

---

## 2. Files to be created (additions to existing structure)

```
src/
├── lib/
│   └── ai/
│       ├── job-extraction.interface.ts       # JD → structured skill list (reuses M2's extraction pattern)
│       ├── gemini-job-extraction.provider.ts
│       ├── openai-job-extraction.provider.ts
│       └── resume-tailoring.ts               # base resume + JD → rewritten sections, prompt builder
├── modules/
│   └── jobs/
│       ├── jobs.routes.ts              # 8 endpoints, JWT-protected, matches/tailor gated on ats_score ≥ 70
│       ├── jobs.controller.ts
│       ├── jobs.service.ts             # Orchestration: threshold check → cache check → pgvector match query → filter → format
│       ├── jobs.repository.ts          # Raw SQL for jobs, job_skills, job_applications, tailored_resumes
│       ├── jobs.validators.ts          # Zod schemas (preferences query params, manual-JD payload, status enum)
│       ├── ingestion/
│       │   ├── indeed.connector.ts     # Indeed Publisher API client
│       │   ├── wellfound.connector.ts  # Wellfound API client
│       │   └── ingestion.worker.ts     # BullMQ repeatable job: fetch → dedupe → extract skills → embed → upsert → deactivate stale
│       └── matching.service.ts         # pgvector query builder (profile_embedding vs. jd_embedding, cosine similarity, preference filters)
├── db/migrations/
│   ├── 019_create_jobs.sql
│   ├── 020_create_job_skills.sql
│   ├── 021_create_job_applications.sql
│   ├── 022_create_tailored_resumes.sql
│   └── 023_alter_resumes_add_profile_embedding.sql
└── tests/
    ├── jobs.test.ts               # Integration tests (mock AI provider + ingestion connectors, real DB)
    └── matching.test.ts           # Unit tests for cosine-similarity ranking + preference filtering (no DB, no network)
```

---

## 3. Database schema (migrations 019–023)

### `jobs`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK, default gen_random_uuid() | |
| source | ENUM('indeed','wellfound','manual'), NOT NULL | `linkedin`/`naukri` intentionally absent — see deviations above |
| external_id | VARCHAR(255), NOT NULL | Source's own listing ID |
| title | VARCHAR(255), NOT NULL | |
| company | VARCHAR(255), NOT NULL | |
| company_type | VARCHAR(50), nullable | startup/enterprise/etc., used for preference filtering |
| location | VARCHAR(255), nullable | |
| description | TEXT, NOT NULL | Raw JD text |
| jd_embedding | VECTOR(768), nullable | Set after embedding step; nullable briefly during ingestion |
| apply_url | TEXT, NOT NULL | |
| posted_at | TIMESTAMP, nullable | From source metadata if available |
| scraped_at | TIMESTAMP, DEFAULT NOW() | Last time this row was refreshed by ingestion |
| is_active | BOOLEAN, DEFAULT true | Set false when not seen in latest ingestion run |
| created_at | TIMESTAMP, DEFAULT NOW() | |

Unique constraint: `(source, external_id)`. Index: `jd_embedding` via `ivfflat` (pgvector), same indexing approach as M3's `skills.embedding`.

### `job_skills`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| job_id | UUID FK → jobs.id, CASCADE | |
| skill_id | UUID FK → skills.id | Resolved via M3's exact-match → pgvector fallback against the extracted skill name |
| importance | ENUM('required','preferred'), NOT NULL | Mirrors `role_requirements.importance` from M3 |

Mirrors M3's `role_requirements` table shape deliberately — same downstream gap-analysis code can run against either.

### `job_applications`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users.id, CASCADE | |
| job_id | UUID FK → jobs.id | |
| status | ENUM('applied','interview','offer','rejected'), DEFAULT 'applied' | |
| applied_at | TIMESTAMP, DEFAULT NOW() | |
| updated_at | TIMESTAMP, DEFAULT NOW() | Bumped on each status change |
| notes | TEXT, nullable | Free-text user notes |

Unique constraint: `(user_id, job_id)` — one tracked application per job per user.

### `tailored_resumes`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users.id, CASCADE | |
| source_resume_id | UUID FK → resumes.id | Base resume the tailoring started from |
| job_id | UUID FK → jobs.id, nullable | Null for manually-pasted JDs not stored in `jobs` |
| tailored_content | JSONB, NOT NULL | AI-rewritten sections, same shape as `resumes.parsed_data` for reuse of any existing rendering code |
| created_at | TIMESTAMP, DEFAULT NOW() | |

### `resumes` (altered)
| Column | Type | Notes |
|---|---|---|
| profile_embedding | VECTOR(768), nullable | Added by migration 023; computed when a resume is activated, from a synthesized "skills + target role" text block via the same embedding service M3 introduced |

---

## 4. API contract (proposed)

All endpoints require `Authorization: Bearer <accessToken>`. `GET /jobs/matches` and `POST /jobs/:jobId/tailor-resume` additionally require the active resume's `ats_score >= 70`.

| Method | Endpoint | Body / Query | Purpose |
|---|---|---|---|
| GET | `/api/jobs/matches` | `?location=&companyType=` | Per SRS §2.3 — top 20 matches, pgvector-ranked, preference-filtered. `403` with a "raise your score" payload if `ats_score < 70` |
| GET | `/api/jobs/:jobId` | — | Full job detail (description, extracted required/preferred skills, missing-skills breakdown for the requesting user) |
| POST | `/api/jobs/manual` | `{ jobUrl? , jobText }` | Deviation-mitigation endpoint (see §1) — one-off match-score + skill-gap for a pasted JD, not persisted to the shared `jobs` table beyond a `source='manual'` row scoped to that user's request |
| POST | `/api/jobs/:jobId/tailor-resume` | — | FR flow step 7 — AI rewrites the active resume's sections for this JD, returns a `tailored_resumes` record |
| GET | `/api/jobs/tailored/:tailoredResumeId` | — | Fetch a previously generated tailored resume |
| POST | `/api/jobs/:jobId/apply` | `{ notes? }` | Creates a `job_applications` row with `status='applied'` — user self-reports having applied externally |
| PATCH | `/api/jobs/applications/:applicationId` | `{ status, notes? }` | Update tracked status (interview/offer/rejected) |
| GET | `/api/jobs/applications` | `?status=` | List the user's tracked applications, optionally filtered |

### Match request flow

```
Client                    API                   Redis           Postgres          AI Provider
  │  GET /jobs/matches      │                      │                 │                  │
  │ ─────────────────────────►│                      │                 │                  │
  │                          │  check active resume  │                 │                  │
  │                          │  ats_score >= 70       │                 │                  │
  │                          │ ─────────────────────────────────────────►│                  │
  │                          │ ◄─────────────────────────────────────────│  (score / 403)   │
  │                          │                      │                 │                  │
  │                          │  cache check           │                 │                  │
  │                          │ ─────────────────────►│                 │                  │
  │                          │ ◄─────────────────────│  hit → return    │                  │
  │                          │                      │  cached matches   │                  │
  │                          │  [cache miss path]     │                 │                  │
  │                          │  fetch profile_embedding│                │                  │
  │                          │  from active resume     │                 │                  │
  │                          │ ─────────────────────────────────────────►│                  │
  │                          │ ◄─────────────────────────────────────────│                  │
  │                          │  pgvector cosine query   │                 │                  │
  │                          │  (jobs.jd_embedding,     │                 │                  │
  │                          │   filtered by location/   │                 │                  │
  │                          │   companyType, top 20)     │                 │                  │
  │                          │ ─────────────────────────────────────────►│                  │
  │                          │ ◄─────────────────────────────────────────│                  │
  │                          │  per-match: run gap       │                 │                  │
  │                          │  analysis (job_skills vs.  │                 │                  │
  │                          │  user skills, reusing M3)  │                 │                  │
  │                          │  cache result (1h TTL)     │                 │                  │
  │                          │ ─────────────────────►│                 │                  │
  │ ◄──────────────────────── │  20 matches: %, missing   │                 │                  │
  │                          │  skills, company info,    │                 │                  │
  │                          │  apply link                │                 │                  │
```

---

## 5. Ingestion pipeline (`ingestion.worker.ts`)

Nightly (2am), per source connector:

1. Fetch new/updated listings from Indeed Publisher API and Wellfound API (paginated, rate-limited per each API's own limits).
2. Deduplicate against existing `(source, external_id)` rows — update `scraped_at` and any changed fields on existing rows, insert new ones.
3. For each new/changed listing: LLM-extract a structured skill list from `description` (forced JSON, Zod-validated, 1 retry — same shape as M2's resume-parsing extraction), fuzzy-match each extracted skill name to `skills.id` via M3's exact-match → pgvector fallback, upsert `job_skills` rows.
4. Embed the JD text via the same embedding service M3 uses for skills/roles, store on `jd_embedding`.
5. After all sources processed: any `jobs` row with `scraped_at` older than the current run's start time is set `is_active = false` (stale listing, no longer seen at the source).

Failure handling: per-listing extraction/embedding failures are logged and skip that listing (it simply won't appear in matches until the next successful run) rather than failing the whole nightly batch — consistent with M2's BullMQ retry-then-log pattern for individual job failures.

---

## 6. Matching & gap analysis (`matching.service.ts`)

- Cosine similarity computed via pgvector's `<=>` operator between the active resume's `profile_embedding` and each active job's `jd_embedding`, ordered ascending (closer = better match), `LIMIT 20` after preference filters (`location`, `companyType`) are applied as `WHERE` clauses ahead of the vector ranking — filtering before ranking, not after, so the top-20 cutoff is applied to the already-relevant subset.
- Cosine distance is normalized to a 0–100 "match %" using the same linear-normalization approach M3's skill-gap "match percentage" already uses, so the platform has one consistent definition of "match %" rather than two.
- Missing skills per match: `job_skills` (this job's required/preferred skills) minus the user's matched skills — **the exact same function M3's gap-analysis service already exposes for role-vs-user comparison**, called here with a job's `job_skills` rows in place of a curated role's `role_requirements` rows. This is the main piece of "reuse, not rebuild" in M6.

---

## 7. Resume tailoring (`resume-tailoring.ts`)

`POST /jobs/:jobId/tailor-resume`:

1. Confirms `ats_score >= 70` gate (same threshold as matches — tailoring without first clearing the unlock bar isn't offered, keeping the gate consistent across both features described in the same flow).
2. Single LLM call: active resume's `parsed_data` (skills/projects/education/experience — not raw resume text, same PII-minimization discipline M4's context injection used) + this job's `description` and extracted `job_skills` → rewritten sections emphasizing the overlap and reframing relevant experience toward this specific JD's language.
3. Result stored as a new `tailored_resumes` row, **not** written back into `resumes` or made "active" — it's a derived, job-specific artifact a user can view/export, not a new resume version competing with M2's one-active-resume-per-user model.
4. Rate-limited 5/hour/user (same shape as M3's roadmap-regenerate limit) — tailoring is an LLM generation call, not a cheap read.

---

## 8. Security & rate limiting

- `GET /jobs/matches` and `POST /jobs/:jobId/tailor-resume` both re-check the ats_score gate server-side on every call — never trust a client-cached "I'm unlocked" state, since a resume can be deleted/replaced and drop the active score between requests.
- `POST /jobs/manual` — `jobText` is capped (e.g. 20,000 chars) before hitting the extraction LLM call, and rate-limited (10/day/user) since it's an uncached, user-controlled-input LLM call with no ingestion-pipeline dedup to fall back on.
- `job_applications` and `tailored_resumes` endpoints verify `user_id = req.user.id` ownership, same pattern as M5's session-ownership checks.
- Ingestion connectors' API keys (Indeed, Wellfound) live in environment variables, never client-exposed — ingestion is entirely server-side/worker-side, no endpoint triggers it on demand from the client.

---

## 9. Test coverage (planned)

### `tests/matching.test.ts` (unit — no DB, no network)
| Test | Covers |
|---|---|
| Cosine distance correctly normalized to 0–100 match % | §6 normalization |
| Preference filters (location, companyType) applied before the top-20 cutoff, not after | §6 filter-then-rank |
| Missing-skills calculation reuses M3's gap function correctly against `job_skills` shape | §6 reuse claim |

### `tests/jobs.test.ts` (integration — mock AI provider + ingestion connectors, real DB)
| Test | Covers |
|---|---|
| `ats_score < 70` → `403` on both matches and tailor-resume endpoints | Threshold gate |
| `ats_score >= 70` → matches returned, ≤ 20 results | Core flow |
| Ingestion worker upserts new listings, updates existing, deactivates stale ones | §5 |
| Ingestion failure on one listing doesn't fail the whole batch | §5 failure handling |
| `POST /jobs/manual` scores a pasted JD without persisting to shared `jobs` table | §1 deviation-mitigation |
| Tailor-resume produces a `tailored_resumes` row without altering `resumes.is_active` | §7 step 3 |
| Tailor-resume rate limit — 6th request in an hour → 429 | §7 step 4 |
| Application status transitions (`applied → interview → offer`) persist correctly | Application tracking |
| Cross-user access to another user's application/tailored resume → 403 | Security |
| 401 without auth token on all 8 endpoints | Security |

---

## 10. Known risks / open decisions before build

- **LinkedIn/Naukri ingestion gap is a real product/legal decision, not a technical one.** M6 as specced here does not cover two of the four sources SRS flow §3.6 step 2 names. Before this is treated as "done," product/legal should confirm whether a formal data-partnership route exists for either platform, or whether the manual-paste fallback (§4) is considered sufficient coverage.
- **Indeed/Wellfound API coverage and rate limits weren't verified against current terms at guide-writing time** — both APIs' current availability, geographic coverage (India-specific listings, given CareerOS's target market), and rate limits should be confirmed against their live developer docs before ingestion is built, not assumed from general knowledge.
- **`profile_embedding` recomputation trigger.** Currently specified as "computed when a resume becomes active" — but a user's `career_goals` (part of the synthesized embedding text) can change independently via onboarding edits without a new resume upload. Whether a goals-only change should also trigger re-embedding is unresolved; leaving it stale until the next resume activation is the current default but may under-serve users who update goals without re-uploading.
- **`company_type` values aren't standardized in this guide** (source APIs may not consistently label "startup" vs. "enterprise"). A normalization step/mapping table may be needed once real API response shapes are inspected.
- **No dedup across sources for the same underlying job.** The same role posted on both Indeed and Wellfound would currently appear twice in matches. Cross-source dedup (e.g. by company + title + location fuzzy match) isn't in this guide's scope but is a plausible near-term follow-up once real data volume is seen.

---

## 11. What M6 does NOT include (deferred)

- Automated LinkedIn/Naukri ingestion — see §1 deviations and §10
- Cross-source duplicate-listing detection — see §10
- Automated application-status detection (e.g. parsing confirmation emails) — flow §3.6 only specifies manual tracking
- Precomputed/materialized per-user match tables — deliberately on-demand, see §1
- Company review data, salary benchmarking, or any enrichment beyond what the JD text itself provides
- Any Razorpay/plan-upgrade flow — job matching's only gate is the ats_score ≥ 70 threshold, not subscription tier, per the SRS as written
