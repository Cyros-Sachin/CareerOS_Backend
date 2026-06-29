# CareerOS Backend — Milestone 2: Resume Engine (Upload, Parsing, ATS Scoring)

**Scope:** Resume upload via AWS S3 pre-signed URLs, async text extraction (`pdfjs-dist` / `mammoth`), provider-agnostic AI structured parsing (Gemini 2.5 Flash default, OpenAI GPT-4o fallback), the 6-dimension ATS scoring engine, score history, multi-resume versioning, and free-tier scan limits — built on the Milestone 1 foundation (raw `pg`, Zod, Redis, BullMQ-ready Docker stack). **Migrated from Cloudflare R2 to AWS S3 (June 2026).**

**Builds directly on M1.** Reuses: `authenticate` middleware, `pool.ts` query helpers, `rateLimiter` factory, `errorHandler`, `logger`, migration runner, and the existing `users` table (`subscription_tier` column already exists for scan-limit gating).

**Status: FULLY IMPLEMENTED.** This guide documents what was built, not just what was planned.

---

## 1. Architecture decisions (as implemented)

| Concern | Decision | Why |
|---|---|---|
| File storage | **AWS S3**, pre-signed PUT URLs via `@aws-sdk/client-s3` | SRS FR-2.3 — file never passes through the API server |
| Job queue | **BullMQ**, `resume-parsing` queue, shared Redis connection with rate limiter | Keeps parsing off the HTTP request thread |
| Worker process | Separate entrypoint `src/worker.ts`, run as `npm run worker` | Independent process, survives API restarts |
| Text extraction | `pdfjs-dist` for PDF, `mammoth` for DOCX | Both pure-JS, no native deps |
| AI parsing | Provider-agnostic (`AI_PROVIDER` env var). Gemini 2.5 Flash (default, `responseMimeType: "application/json"`) or OpenAI GPT-4o (`response_format: { type: "json_object" }`). Both via `ResumeParserService` interface in `src/lib/ai/` | Structured extraction per FR-2.5 |
| ATS scoring | Deterministic weighted composite in `scoring.service.ts`, **not** left to the LLM | LLM unreliable at arithmetic; math is plain TypeScript |
| Score storage | `resumes.dimension_scores` JSONB + `resume_score_history` table | JSONB for latest breakdown; history table for week-over-week graph |
| Resume versioning | Multiple rows per user, `is_active` boolean, partial unique index | Enforces exactly one active per user |
| Scan limit enforcement | Counted in Postgres (`resume_scans` table, one row per scan event) | Survives Redis flushes, queryable for billing |
| Validation | Zod, same pattern as M1 | Consistency |
| File constraints | PDF/DOCX only, ≤ 5MB, ≤ 3 pages (checked server-side after extraction) | FR-2.1, FR-2.2 |

### Key deviations from original plan

- **S3 env vars are optional** — if `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are not set, `s3Client` becomes `null` and presigned URL generation throws a clear error message. Same for AI provider API keys (conditional on `AI_PROVIDER`). This means the API boots even without these configured (but resume upload will fail with actionable error messages).
- **Migrated from Cloudflare R2 to AWS S3** — the storage client was rewritten in `src/lib/s3.ts` with standard AWS S3 config (`region` + `credentials`, no custom `endpoint`). Exported function signatures changed to match S3 semantics (`getUploadUrl`, `getDownloadUrl`, `getObjectBuffer`, `deleteObject`, `buildResumeKey`). All env vars renamed from `R2_*` → `AWS_*` / `S3_*`.
- **Market Competitiveness** dimension uses a fixed baseline of 65 (not percentile-based) since there's no significant resume corpus yet. The function signature accepts `_data` for future use.
- **BullMQ connection** reuses the existing ioredis `redis` instance from M1's rate limiter, not a new connection. Avoids opening extra TCP sockets.
- **No separate `worker` Redis connection** — the `ConnectionOptions` object extracts host/port/password/db from the existing `redis.options`, sharing the same Redis instance.
- **`@types/pdfjs-dist` not installed** — pdfjs-dist v6 includes its own types.

---

## 2. Files created (current structure additions)

```
src/
├── jobs/
│   ├── queue.ts                # BullMQ Queue + Worker factory
│   └── resume-parsing.job.ts   # Job processor: download → extract → AI parse → score → save
├── lib/
│   ├── s3.ts                   # S3Client, presigned URL generation, object CRUD, file key helpers
│   ├── ai/
│   │   ├── index.ts            # Provider selector singleton (env.AI_PROVIDER)
│   │   ├── resume-parser.interface.ts  # ResumeParserService interface + ParsedResumeData type
│   │   ├── gemini.provider.ts  # Gemini 2.5 Flash implementation
│   │   └── openai.provider.ts  # OpenAI GPT-4o implementation (refactored from openai.ts)
│   └── text-extraction/
│       ├── pdf-extractor.ts    # pdfjs-dist wrapper (returns text + pageCount)
│       └── docx-extractor.ts   # mammoth wrapper (returns text + estimated pageCount)
├── modules/
│   └── resume/
│       ├── resume.routes.ts    # 9 endpoints, all JWT-protected
│       ├── resume.controller.ts
│       ├── resume.service.ts   # Orchestration: upload URL, confirm, CRUD, history
│       ├── resume.repository.ts # Raw SQL for resumes, score_history, scans, role_keywords
│       ├── resume.validators.ts # Zod schemas (uploadUrlSchema + confirmSchema)
│       └── scoring.service.ts  # Pure functions: 6-dimension weighted ATS scoring
├── worker.ts                   # BullMQ worker entrypoint (separate from server.ts)
├── db/migrations/
│   ├── 006_create_resumes.sql
│   ├── 007_create_resume_score_history.sql
│   ├── 008_create_resume_scans.sql
│   └── 009_create_role_keywords.sql
└── tests/
    ├── resume.test.ts          # Integration tests (mock S3 + AI provider)
    └── scoring.test.ts         # Pure unit tests for scoring.service.ts (no DB needed)
```

---

## 3. Database schema (migrations 006-009)

### `resumes`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK, default gen_random_uuid() | |
| user_id | UUID FK → users.id, CASCADE | |
| file_url | TEXT, NOT NULL | Public URL for the uploaded file |
| file_key | TEXT, NOT NULL | R2 object key: `resumes/{userId}/{resumeId}.{ext}` |
| original_filename | VARCHAR(255), NOT NULL | |
| file_size_bytes | INTEGER, NOT NULL | |
| mime_type | VARCHAR(100), NOT NULL | 'application/pdf' or '...wordprocessingml.document' |
| status | ENUM('uploaded','processing','parsed','scored','failed'), DEFAULT 'uploaded' | |
| failure_reason | TEXT, nullable | Populated when status = 'failed' |
| page_count | INTEGER, nullable | Set after extraction |
| raw_text | TEXT, nullable | Extracted text (PII — never log) |
| parsed_data | JSONB, nullable | `{ skills, projects, education, experience, certifications }` |
| ats_score | INTEGER, nullable, CHECK (0-100) | |
| dimension_scores | JSONB, nullable | `{ quality, ats, projects, experience, interview, market }` |
| suggestions | JSONB, nullable | Array of 5-10 strings |
| is_active | BOOLEAN, DEFAULT false | Partial unique index enforces 1 active per user |
| created_at | TIMESTAMP, DEFAULT NOW() | |
| updated_at | TIMESTAMP, DEFAULT NOW() | Auto-updated via trigger |

### `resume_score_history`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| resume_id | UUID FK → resumes.id, CASCADE | |
| user_id | UUID FK → users.id, CASCADE | |
| ats_score | INTEGER | 0-100 |
| dimension_scores | JSONB | Full dimension breakdown |
| recorded_at | TIMESTAMP, DEFAULT NOW() | Append-only log for week-over-week graph |

### `resume_scans`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK → users.id, CASCADE | |
| resume_id | UUID FK → resumes.id, SET NULL | |
| billing_cycle_month | VARCHAR(7) | 'YYYY-MM' format, avoids timezone edge cases |
| created_at | TIMESTAMP, DEFAULT NOW() | |

Row inserted per scan attempt that counts against the free-tier limit.

### `role_keywords`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| role_name | VARCHAR(255) | e.g. 'SDE', 'Data Analyst' |
| keyword | VARCHAR(255) | e.g. 'React', 'Python' |
| weight | NUMERIC(3,2), DEFAULT 1.0 | Importance 0-1 |
| category | VARCHAR(100), nullable | |

Stub table for ATS Compatibility scoring. M3 will expand to full 500+ skills / 10 categories.

---

## 4. API contract (as implemented)

All endpoints require `Authorization: Bearer <accessToken>`.

| Method | Endpoint | Body / Query | Status | Purpose |
|---|---|---|---|---|
| POST | `/api/resume/upload-url` | `{ filename, mimeType, fileSizeBytes }` | 200 | Returns pre-signed R2 PUT URL |
| POST | `/api/resume/:id/confirm` | — | 202 | Confirms upload, enqueues parsing job |
| GET | `/api/resume/:id/status` | — | 200 | Poll processing status |
| GET | `/api/resume/:id` | — | 200 | Full detail (parsed data + score + suggestions) |
| GET | `/api/resume/:id/score` | — | 200 | Score + dimension breakdown only |
| GET | `/api/resume/history` | `?limit=` | 200 | Score history (week-over-week) |
| GET | `/api/resume/list` | — | 200 | All resume versions for user |
| PATCH | `/api/resume/:id/activate` | — | 200 | Set as active (unset previous in same transaction) |
| DELETE | `/api/resume/:id` | — | 200 | Delete resume |

### Upload flow

```
Client                    API                          S3                    Worker
  │                        │                           │                      │
  │  POST /upload-url      │                           │                      │
  │──────────────────────► │                           │                      │
  │                        │  Validate mime/size/limit  │                      │
  │                        │  Create resumes row        │                      │
  │                        │  Record scan               │                      │
  │◄────────────────────── │  Return presigned URL       │                      │
  │                        │                           │                      │
  │  PUT file (direct)     │                           │                      │
  │────────────────────────────────────────────────────►│                      │
  │◄────────────────────────────────────────────────────│ 200 OK               │
  │                        │                           │                      │
  │  POST /:id/confirm     │                           │                      │
  │──────────────────────► │                           │                      │
  │                        │  status → 'processing'    │                      │
  │                        │  Enqueue BullMQ job       │                      │
  │◄────────────────────── │ 202 Accepted               │                      │
  │                        │                           │                      │
  │                        │                           │   Worker picks up     │
  │                        │                           │   job                 │
  │  GET /:id/status (poll)│                           │                      │
  │──────────────────────► │                           │                      │
  │◄────────────────────── │ { status: 'processing' }  │                      │
  │                        │                           │                      │
│                        │                           │   Download file from  │
│                        │                           │   S3 → Extract text   │
│                        │                           │   → AI parse (Gemini/ │
│                        │                           │     OpenAI per prov.) │
│                        │                           │   → Score → Save      │
  │                        │                           │                      │
  │  GET /:id/status (poll)│                           │                      │
  │──────────────────────► │                           │                      │
  │◄────────────────────── │ { status: 'scored' }      │                      │
```

---

## 5. ATS Scoring Engine (`scoring.service.ts`)

Six dimensions with deterministic weighted composite:

| Dimension | Weight | Computed from |
|---|---|---|
| Resume Quality | 15% | Presence of skills, projects, experience, education sections |
| ATS Compatibility | 25% | Keyword overlap between `parsed_data` and `role_keywords` table |
| Projects | 25% | Count, presence of `githubUrl`, `impactStatement`, `techStack` |
| Experience | 20% | Weighted sum (internship ×2, full-time ×3, open-source ×1) |
| Interview Readiness | 10% | Keyword matches for DSA, system design, competitive programming, hackathons |
| Market Competitiveness | 5% | Fixed baseline (65) — uses percentile rank when sufficient corpus exists |

**Suggestions generation:** Rule-based (not LLM). Each scoring function pushes specific suggestion strings when it docks points. Padded to minimum 5, capped at 10.

---

## 6. Job queue configuration

| Property | Value |
|---|---|
| Queue name | `resume-parsing` |
| Max attempts | 3 |
| Backoff | Exponential, starting at 5s |
| Concurrency | 2 jobs at a time |
| Lock duration | 120s |
| Connection | Shared Redis from `lib/redis.ts` |

---

## 7. Security features implemented

- **File type validation:** MIME type checked in Zod schema at upload-url request. Content verification (magic bytes) should be done in the worker for production hardening.
- **S3 object keys:** Namespaced `resumes/{userId}/{resumeId}.{ext}` — client never influences the key.
- **Rate limiting:** `POST /upload-url` limited to 10/hour/IP via the existing `rateLimiter` factory.
- **S3 pre-signed URLs:** file never passes through API server; URLs expire after 15 minutes.
- **PII not logged:** `raw_text` and `parsed_data` contents are never logged at `info` level or above. Logs contain resume IDs and status transitions only.
- **Free tier gating:** Scans counted in `resume_scans` table with `billing_cycle_month`. Query before generating upload URL.

---

## 8. Test coverage (as implemented)

### `tests/scoring.test.ts` (9 unit tests — no DB, no network)
| Test | Covers |
|---|---|
| ATS score within 0-100 range | FR-3.7 |
| All 6 dimension scores returned | FR-3.1–3.6 |
| 5-10 suggestions generated | FR-3.9 |
| Empty resume scores low (<50) | Edge case |
| Weighted sum matches atsScore exactly | FR-3.7 |
| Concrete suggestion for missing GitHub URL | FR-3.9 |
| Missing projects → projects.raw = 0 | Degenerate case |
| Missing experience → experience.raw = 0 | Degenerate case |
| More experience → higher experience score | FR-3.4 |

### `tests/resume.test.ts` (integration — requires Docker DB)
| Test | Covers |
|---|---|
| Request upload URL — valid PDF | Upload flow |
| Request upload URL — valid DOCX | Upload flow |
| Reject unsupported mime type | FR-2.1 |
| Reject file exceeding max size | FR-2.2 |
| 401 without auth token | Security |
| Confirm upload → 202 accepted | Flow 3.2 step 5 |
| Get resume status | Polling |
| List all resumes for user | API |
| Get resume detail | API |
| Delete resume | CRUD |

---

## 9. Environment variables added

```
# AWS S3 (optional — upload will error with clear message if missing)
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=careeros-resumes

# AI Provider selection (default: gemini)
AI_PROVIDER=gemini

# Google Gemini (default — required when AI_PROVIDER=gemini)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_MS=30000

# OpenAI (fallback — required when AI_PROVIDER=openai)
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
OPENAI_TIMEOUT_MS=30000

# Resume limits
RESUME_MAX_SIZE_MB=5
RESUME_MAX_PAGES=3
FREE_TIER_MONTHLY_SCAN_LIMIT=3
```

---

## 10. Scripts added

```json
"worker": "tsx src/worker.ts"
```

Run in a separate terminal: `npm run worker`

---

## 11. Known tech debt / consolidation opportunities

- **Market Competitiveness dimension** uses a hardcoded baseline (65) instead of true percentile ranking — needs the resume corpus to grow before this can be properly implemented.
- **File content validation** (magic bytes) is not implemented in the worker — should verify `%PDF` or DOCX zip signature before extraction.
- **`role_keywords` table** has no seed data — the ATS Compatibility dimension will return 50 (neutral) when the table is empty. Seed data should be added for common roles (SDE, Data Analyst, Frontend, etc.).
- **BullMQ `removeOnComplete` / `removeOnFail`:** Config set to 100/50 to prevent queue buildup. Adjust based on your observability needs.
- **`raw_text` column for re-parsing:** The worker saves raw text so re-parsing doesn't need re-extraction, but there's no re-parse endpoint yet (future).
- **No automatic `is_active` on first upload:** The first resume scored is not automatically set as active — the client must call `PATCH /:id/activate` explicitly.

---

## 12. What M2 does NOT include (deferred)

- Full skills database (500+ skills, 10 categories) — M3
- Gap analysis / roadmap generation — M3
- "Tailor Resume for JD" AI rewrite — M6
- Weekly score-change email nudges — later
- Resume PDF export — M4 (roadmap PDF export)
- Razorpay plan upgrade — M7
