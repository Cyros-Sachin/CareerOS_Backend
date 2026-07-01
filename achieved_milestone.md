# CareerOS Backend — Milestone Summary (M1 + M2 + M3)

## Milestone 1: Auth + Onboarding

**Scope:** Registration, login, Google OAuth, email verification, JWT session management, and the 5-step onboarding flow.

### Implemented Features

| Feature | Status |
|---------|--------|
| Email/password registration with Resend verification email | ✅ |
| Google OAuth (Authorization Code flow) | ✅ |
| JWT access tokens (15 min) + opaque refresh tokens (7 days, rotated) | ✅ |
| Email verification flow (24h token, resend support) | ✅ |
| Forgot/reset password (6-digit OTP, 10 min expiry, max 5 attempts) | ✅ |
| 5-step onboarding wizard (personal info → goals → preferences → skill level → complete) | ✅ |
| Account lockout (5 failed attempts → 30 min lock) | ✅ |
| Rate limiting (Redis-backed, per-endpoint configurable) | ✅ |
| Refresh token rotation + reuse detection (all sessions revoked on compromise) | ✅ |
| Anti-enumeration (register, resend-verification, forgot-password all return generic success) | ✅ |
| Zod validation on all inputs | ✅ |

### Routes

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/api/auth/register` | Public |
| GET | `/api/auth/verify-email?token=` | Public |
| POST | `/api/auth/resend-verification` | Public |
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/google` | Public |
| GET | `/api/auth/google/callback` | Public |
| POST | `/api/auth/refresh` | Cookie |
| POST | `/api/auth/logout` | JWT |
| GET | `/api/auth/me` | JWT |
| POST | `/api/auth/forgot-password` | Public |
| POST | `/api/auth/reset-password` | Public |
| GET | `/api/onboarding/status` | JWT |
| PATCH | `/api/onboarding/step-1` | JWT |
| PATCH | `/api/onboarding/step-2` | JWT |
| PATCH | `/api/onboarding/step-3` | JWT |
| PATCH | `/api/onboarding/step-4` | JWT |
| POST | `/api/onboarding/complete` | JWT |

---

## Milestone 2: Resume Engine

**Scope:** Resume upload via AWS S3 pre-signed URLs, async text extraction, provider-agnostic AI parsing (Gemini/OpenAI), 6-dimension ATS scoring, score history, multi-resume versioning, free-tier scan limits.

### Implemented Features

| Feature | Status |
|---------|--------|
| S3 pre-signed PUT URL upload (file never passes through API server) | ✅ |
| PDF extraction via pdfjs-dist | ✅ |
| DOCX extraction via mammoth | ✅ |
| Provider-agnostic AI parsing (Gemini 2.5 Flash default, OpenAI GPT-4o fallback) | ✅ |
| Zod-validated AI response with 1 retry on failure | ✅ |
| 6-dimension ATS scoring engine (Quality, ATS Compatibility, Projects, Experience, Interview Readiness, Market Competitiveness) | ✅ |
| BullMQ async parsing queue (3 retries, exponential backoff) | ✅ |
| Score history (append-only, week-over-week tracking) | ✅ |
| Multi-resume versioning (one active per user, partial unique index) | ✅ |
| Free-tier scan limit (3/month, tracked in Postgres) | ✅ |
| S3 object key isolation (user ID + resume ID, client never influences path) | ✅ |
| File constraints (PDF/DOCX only, ≤ 5MB, ≤ 3 pages) | ✅ |

### Routes

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/api/resume/upload-url` | JWT |
| POST | `/api/resume/:id/confirm` | JWT |
| GET | `/api/resume/:id/status` | JWT |
| GET | `/api/resume/:id` | JWT |
| GET | `/api/resume/:id/score` | JWT |
| GET | `/api/resume/history` | JWT |
| GET | `/api/resume/list` | JWT |
| PATCH | `/api/resume/:id/activate` | JWT |
| DELETE | `/api/resume/:id` | JWT |

---

## Milestone 3: Skills Database + Gap Analysis + Roadmap Generation

**Scope:** Seeded skills taxonomy (500+ skills / 10 categories), target-role requirement profiles, semantic gap calculation, AI-generated month-by-month roadmaps, roadmap progress tracking, and dynamic regeneration — built on the M1 + M2 foundation.

### Implemented Features

| Feature | Status |
|---------|--------|
| `skills` table with 10 categories (Languages, Frontend, Backend, Databases, DevOps/Cloud, DSA & CS Fundamentals, Mobile, AI/ML, Soft Skills, Tools) | ✅ |
| `role_requirements` table with importance weighting, proficiency levels, and estimated learning hours | ✅ |
| `roadmaps` + `roadmap_items` normalized tables (not JSONB blobs) | ✅ |
| Migration of `role_keywords` → `skills` (migration 010) | ✅ |
| Provider-agnostic embedding service (Gemini text-embedding-004 / OpenAI text-embedding-3-small) | ✅ |
| Two-stage gap analysis: exact match → pgvector cosine similarity fallback | ✅ |
| Missing skills sorted by importance desc, learning hours asc | ✅ |
| Match percentage calculation | ✅ |
| Roadmap generation via LLM (forced JSON, Zod-validated, 1 retry) | ✅ |
| Month count capped by `ceil(totalEstHours / (hoursPerWeek × 4))`, max 12 | ✅ |
| Affiliate link stub (`?ref=careeros` query-param appender) | ✅ |
| Regeneration marks old roadmap `superseded`, creates fresh one | ✅ |
| Item-level completion toggling (PATCH with `completed_at` timestamp) | ✅ |
| Skills browse/search/category endpoints (read-only, JWT-protected) | ✅ |
| Rate limiting on roadmap generate (5/hour/user) | ✅ |
| Seed script for 500+ skills across 10 categories + 5 curated roles | ✅ |

### Routes

| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/api/skills` | JWT |
| GET | `/api/skills/categories` | JWT |
| GET | `/api/gaps/:userId` | JWT |
| POST | `/api/roadmap/generate` | JWT |
| GET | `/api/roadmap/:userId` | JWT |
| GET | `/api/roadmap/detail/:roadmapId` | JWT |
| PATCH | `/api/roadmap/items/:itemId/complete` | JWT |
| POST | `/api/roadmap/:roadmapId/regenerate` | JWT |
| GET | `/api/roadmap/:roadmapId/export.pdf` | JWT (501 stubbed) |

### Database Migrations

| Migration | Description |
|-----------|-------------|
| 010 | `skills` table with pgvector embedding, migrates `role_keywords` data |
| 011 | `role_requirements` table with `proficiency_level` enum |
| 012 | `roadmaps` + `roadmap_items` tables |
| 013 | Placeholder to drop `role_keywords` once read path switchover is confirmed |

### Skills Categories

| Category | Skills |
|----------|--------|
| Languages | 34 skills (JS, TS, Python, Java, Go, Rust, etc.) |
| Frontend | 48 skills (React, Vue, Angular, Tailwind, Next.js, etc.) |
| Backend | 47 skills (Node.js, Express, Django, FastAPI, Spring Boot, etc.) |
| Databases | 28 skills (PostgreSQL, MongoDB, Redis, Elasticsearch, etc.) |
| DevOps/Cloud | 40 skills (AWS, Docker, Kubernetes, Terraform, CI/CD, etc.) |
| DSA & CS Fundamentals | 27 skills (Arrays, DP, Graphs, System Design, OOP, etc.) |
| Mobile | 18 skills (Android, iOS, React Native, Flutter, etc.) |
| AI/ML | 28 skills (PyTorch, TensorFlow, LLMs, RAG, LangChain, etc.) |
| Soft Skills | 16 skills (Communication, Leadership, Agile, etc.) |
| Tools | 23 skills (Git, VS Code, Figma, Docker, etc.) |

### Curated Target Roles

| Role | Requirements |
|------|-------------|
| SDE | 20 requirements (Algorithms, System Design, DS, React, Node.js, etc.) |
| Data Analyst | 14 requirements (SQL, Python, Pandas, Statistics, Tableau, etc.) |
| Frontend Developer | 19 requirements (React, TypeScript, CSS, Next.js, etc.) |
| Backend Developer | 19 requirements (Node.js, PostgreSQL, Redis, Docker, AWS, etc.) |
| ML Engineer | 20 requirements (Python, ML, PyTorch, Deep Learning, Statistics, etc.) |

---

## Milestone 4: AI Mentor

**Scope:** Conversational AI career mentor with SSE-streamed responses, persisted conversation history, full-context prompt injection (profile + resume + chat history), tiered daily rate limiting, GitHub profile audit, response caching, and content-safety filter.

### Implemented Features

| Feature | Status |
|---------|--------|
| SSE-streamed chat responses (Server-Sent Events) | ✅ |
| Provider-agnostic mentor chat (Gemini 2.5 Flash / OpenAI GPT-4o streaming) | ✅ |
| `conversations` + `conversation_messages` normalized tables | ✅ |
| Auto-created single conversation per user (first message) | ✅ |
| Context injection: user profile + active resume + last 10 messages | ✅ |
| Tiered daily rate limiting (free=10, student=100, pro=unlimited) | ✅ |
| Response caching (Redis, 24h TTL, SHA-256 hashed normalized question) | ✅ |
| Cache hits don't consume daily quota | ✅ |
| Stage-1 content safety filter (keyword/regex pre-filter) | ✅ |
| Stage-2 provider-side safety (Gemini safety categories) | ✅ |
| Flagged messages persisted with `flagged_by_safety_filter = true` | ✅ |
| GitHub profile audit (public API, no OAuth required) | ✅ |
| Suggested prompts endpoint (6 prompts, personalized by career goals) | ✅ |
| Chat history endpoint (last N messages, paginated) | ✅ |
| Conversation title auto-generated from first message | ✅ |

### Routes

| Method | Endpoint | Auth |
|--------|----------|------|
| GET | `/api/mentor/history` | JWT |
| POST | `/api/mentor/chat` | JWT (SSE streamed) |
| GET | `/api/mentor/suggested-prompts` | JWT |
| POST | `/api/mentor/github-audit` | JWT (rate-limited 10/hr) |

### Database Migrations

| Migration | Description |
|-----------|-------------|
| 014 | `conversations` table with `updated_at` trigger |
| 015 | `conversation_messages` table with `message_role` enum |

### Chat Architecture

```
Client → POST /mentor/chat → Rate check → Safety filter → Cache check
  → [miss] Build context (profile + resume + last 10 msgs)
  → Stream completion from AI provider
  → Persist user message + assistant response
  → Cache full response (24h)
  → SSE: data: {"text":"..."} ... data: [DONE]
```

### Rate Limiting

| Tier | Daily Limit | Enforcement |
|------|-------------|-------------|
| free | 10 messages/day | Postgres count query (survives Redis flush) |
| student | 100 messages/day | Postgres count query |
| pro | Unlimited | No check |

### Content Safety

| Stage | Method | When |
|-------|--------|------|
| 1 | Keyword/regex pattern check | Before any LLM call, in-process (no I/O) |
| 2 | Provider safety settings | During LLM streaming (Gemini safety categories) |

### GitHub Audit

Read-only public profile analysis via GitHub REST API. No OAuth required. Optional `GITHUB_TOKEN` env var raises rate limit from 60/hr to 5000/hr. Returns structured profile summary (repos, stars, languages, followers, etc.).

---

## Milestone 5: Mock Interviews

**Scope:** AI-generated mock interview sessions across three modes (Technical / System Design / HR-Behavioral), server-enforced session timers, per-answer real-time AI evaluation, post-session composite reports, interview history, and a feedback loop that writes the result back into the resume's Interview Readiness dimension score.

### Implemented Features

| Feature | Status |
|---------|--------|
| Three interview modes: Technical, System Design, HR | ✅ |
| AI-generated 5 questions per session (Zod-validated JSON, 1 retry) | ✅ |
| Provider-agnostic interview AI (Gemini 2.5 Flash / OpenAI GPT-4o) | ✅ |
| Pro-tier gating with structured upgrade-CTA payload (403) | ✅ |
| Session timer enforcement (2700s technical/system design, 1800s HR) | ✅ |
| Per-answer real-time AI evaluation (5 dimensions: correctness, complexity, communication, best practices, completeness) | ✅ |
| Answer autosave (PATCH, no AI call, client-polled every 30s) | ✅ |
| Late submission flagging (`submitted_late = true` without hard cutoff) | ✅ |
| Post-session composite report (aggregated across 5 answers) | ✅ |
| Interview Readiness sync → `resumes.dimension_scores.interviewReadiness` | ✅ |
| ATS score recomposition after interview sync | ✅ |
| Graceful skip of resume sync when no active resume exists | ✅ |
| Interview history endpoint (most recent first, paginated) | ✅ |
| Owner-only access verification on all session endpoints | ✅ |
| Rate limiting on session start (5/hour/user) | ✅ |
| Session abandonment support | ✅ |

### Routes

| Method | Endpoint | Auth | Rate Limited |
|--------|----------|------|-------------|
| POST | `/api/interview/start` | JWT + Pro tier | 5/hr/user |
| GET | `/api/interview/history` | JWT | No |
| GET | `/api/interview/:sessionId` | JWT | No |
| PATCH | `/api/interview/:sessionId/answers/:questionId` | JWT | No |
| POST | `/api/interview/:sessionId/answers/:questionId/submit` | JWT | No |
| POST | `/api/interview/:sessionId/complete` | JWT | No |
| GET | `/api/interview/:sessionId/report` | JWT | No |
| POST | `/api/interview/:sessionId/abandon` | JWT | No |

### Database Migrations

| Migration | Description |
|-----------|-------------|
| 016 | `interview_sessions` table with `interview_mode`, `interview_difficulty`, `interview_status` enums |
| 017 | `interview_questions` table with unique constraint on `(session_id, question_order)` |
| 018 | `interview_answers` table with JSONB scores, feedback, and model answers |

---

## Milestone 6: Job Matching

**Scope:** Job ingestion from Indeed + Wellfound APIs, pgvector-based job matching using resume profile embeddings, manual job description scoring, AI-powered resume tailoring per job, application tracking pipeline, and a BullMQ cron-based ingestion worker.

### Implemented Features

| Feature | Status |
|---------|--------|
| `jobs` table with pgvector JD embeddings (`job_source`, `company_type` enums) | ✅ |
| `job_skills` join table with `skill_importance` enum | ✅ |
| `job_applications` table with `application_status` enum | ✅ |
| `tailored_resumes` table for storing per-job tailored content | ✅ |
| `profile_embedding` column on `resumes` (pgvector, computed at activation time) | ✅ |
| pgvector cosine similarity matching (normalized 0-100, gated on `ats_score >= 70`) | ✅ |
| Manual job paste endpoint with AI skill extraction + instant match scoring | ✅ |
| Resume tailoring via AI (rewrites resume content to match job requirements) | ✅ |
| Job detail endpoint with missing skills analysis per user | ✅ |
| Application CRUD (apply, update status, list with optional status filter) | ✅ |
| Owner-only access on applications and tailored resumes (403 cross-user) | ✅ |
| Indeed Publisher API connector (job search + fetch) | ✅ |
| Wellfound API connector (job search + fetch) | ✅ |
| BullMQ ingestion worker with repeatable cron job (`JOBS_INGESTION_CRON`) | ✅ |
| Redis caching for match results (SHA-256 keyed, configurable TTL) | ✅ |
| Rate limiting on manual job (10/hr/user) and tailor-resume (5/hr/user) | ✅ |

### Routes

| Method | Endpoint | Auth | Rate Limited |
|--------|----------|------|-------------|
| GET | `/api/jobs/matches` | JWT + score gate | No |
| POST | `/api/jobs/manual` | JWT + score gate | 10/hr/user |
| GET | `/api/jobs/:jobId` | JWT | No |
| POST | `/api/jobs/:jobId/tailor-resume` | JWT + score gate | 5/hr/user |
| GET | `/api/jobs/tailored/:tailoredResumeId` | JWT | No |
| POST | `/api/jobs/:jobId/apply` | JWT | No |
| PATCH | `/api/jobs/applications/:applicationId` | JWT | No |
| GET | `/api/jobs/applications` | JWT | No |

### Database Migrations

| Migration | Description |
|-----------|-------------|
| 019 | `jobs` table with `job_source`, `company_type` enums and pgvector `jd_embedding` |
| 020 | `job_skills` join table with `skill_importance` enum |
| 021 | `job_applications` table with `application_status` enum + unique on `(user_id, job_id)` |
| 022 | `tailored_resumes` table |
| 023 | `profile_embedding` column on `resumes` + pgvector ivfflat index |

### Files Created

```
src/
├── lib/ai/
│   ├── job-extraction.interface.ts           # JobExtractionService interface + TailoredResumeContent
│   ├── resume-tailoring.ts                   # Prompt builders + Zod schemas for tailoring
│   ├── gemini-job-extraction.provider.ts     # Gemini skill extraction
│   └── openai-job-extraction.provider.ts     # OpenAI skill extraction
├── modules/jobs/
│   ├── jobs.routes.ts                        # 8 endpoints with auth + rate limiting
│   ├── jobs.controller.ts                    # HTTP request handlers
│   ├── jobs.service.ts                       # Orchestration: matches → manual → apply → tailor
│   ├── jobs.repository.ts                    # Full SQL CRUD for jobs, skills, applications, tailored resumes
│   ├── jobs.validators.ts                    # Zod schemas for all job inputs
│   ├── matching.service.ts                   # pgvector cosine similarity + manual match computation
│   └── ingestion/
│       ├── indeed.connector.ts               # Indeed Publisher API client
│       ├── wellfound.connector.ts            # Wellfound API client
│       └── ingestion.worker.ts               # BullMQ repeatable job worker (cron)
├── db/migrations/
│   ├── 019_create_jobs.sql
│   ├── 020_create_job_skills.sql
│   ├── 021_create_job_applications.sql
│   ├── 022_create_tailored_resumes.sql
│   └── 023_alter_resumes_add_profile_embedding.sql
```

### Modified Files

| File | Change |
|------|--------|
| `src/config/env.ts` | Added M6 env vars (INDEED_PUBLISHER_ID, WELLFOUND_API_KEY, MATCHES_CACHE_TTL_SECONDS, JOBS_INGESTION_CRON) |
| `src/lib/ai/index.ts` | Added `createJobExtractionService()` factory |
| `src/app.ts` | Registered `/api/jobs` routes |
| `src/jobs/queue.ts` | Added `jobIngestionQueue` + `createJobIngestionWorker` |
| `src/worker.ts` | Integrated ingestion worker with cron scheduler |
| `src/modules/resume/resume.repository.ts` | Added `profile_embedding` to `ResumeRow` interface |

### Matching Score Calculation

Jobs are matched using pgvector cosine distance (`<=>` operator) between `resumes.profile_embedding` and `jobs.jd_embedding`. The raw distance (-1 to 1) is normalized to 0-100:

```typescript
function normalizeCosineSimilarity(raw: number): number {
  const clamped = Math.max(-1, Math.min(1, raw));
  return Math.round(((clamped + 1) / 2) * 100);
}
```

For manual paste jobs, match percent = `(matchedSkills / totalExtractedSkills) × 100` (case-insensitive).

### Score Gates

All matching and tailoring endpoints enforce:
1. **Active resume exists** → 403 `NO_ACTIVE_RESUME`
2. **ATS score ≥ 70** → 403 `SCORE_TOO_LOW`  
3. **Profile embedding exists** → 400 `NO_PROFILE_EMBEDDING`

### Ingestion Architecture

```
Cron Trigger (JOBS_INGESTION_CRON, default: daily 2 AM)
       │
       ▼
  BullMQ Repeatable Job
       │
       ├── Indeed Connector → Search → Fetch details → Upsert jobs
       │                              ↓
       ├── Wellfound Connector → Search → Fetch details → Upsert jobs
       │                              ↓
       └── Deactivate stale jobs (scraped_at < previous run)
```

---

## Milestone 7: Billing & Subscription (Razorpay)

**Scope:** One-time checkout via Razorpay Orders API, webhook-driven subscription tier upgrades (student/pro), domain-based student verification heuristic, BullMQ cron-based subscription expiry downgrades, and payment history tracking.

### Implemented Features

| Feature | Status |
|---------|--------|
| Razorpay checkout order creation (4 plans: student monthly/annual, pro monthly/annual) | ✅ |
| Razorpay webhook handler with HMAC-SHA256 signature verification | ✅ |
| `payment.captured` → subscription tier upgrade + `subscription_expires_at` set | ✅ |
| `payment.failed` → payment status marked `failed` | ✅ |
| Idempotent webhook processing (`subscription_webhook_events` ledger, UNIQUE `razorpay_event_id`) | ✅ |
| Subscription status endpoint (tier, expiry, student verification) | ✅ |
| Payment history endpoint (most recent first, paginated) | ✅ |
| Domain-based student verification submission (`.ac.in`, `.edu.in`, `.edu`) | ✅ |
| BullMQ repeatable daily job for subscription expiry downgrades (`BILLING_EXPIRY_CRON`) | ✅ |
| Raw-body middleware for webhook route before global JSON parser | ✅ |
| Subscription fields on users table (`subscription_expires_at`, `student_verification_status`) | ✅ |
| `plan_type` enum (`student_monthly`, `student_annual`, `pro_monthly`, `pro_annual`) | ✅ |
| `payment_status` enum (`created`, `paid`, `failed`) | ✅ |
| Rate limiting on checkout (10/hour/user) | ✅ |

### Routes

| Method | Endpoint | Auth | Rate Limited |
|--------|----------|------|-------------|
| POST | `/api/billing/webhook` | Public (Razorpay sig) | No |
| POST | `/api/billing/checkout` | JWT | 10/hr/user |
| GET | `/api/billing/status` | JWT | No |
| GET | `/api/billing/history` | JWT | No |
| POST | `/api/billing/student-verify` | JWT | No |

### Plan Pricing

| Plan Key | Tier | Duration | Amount (INR) |
|----------|------|----------|--------------|
| `student_monthly` | student | 1 month | ₹99 |
| `student_annual` | student | 12 months | ₹999 |
| `pro_monthly` | pro | 1 month | ₹199 |
| `pro_annual` | pro | 12 months | ₹1,999 |

### Database Migrations

| Migration | Description |
|-----------|-------------|
| 024 | `payments` table with `plan_type`, `payment_status` enums + `updated_at` trigger |
| 025 | `subscription_webhook_events` table with UNIQUE `razorpay_event_id` |
| 026 | `subscription_expires_at` + `student_verification_status` columns on `users` |

### Files Created

```
src/
├── lib/payments/
│   ├── razorpay.client.ts                    # Thin Razorpay Orders API wrapper (createOrder, fetchPayment)
│   └── webhook-signature.ts                  # HMAC-SHA256 raw-body verification
├── modules/billing/
│   ├── billing.routes.ts                     # 5 endpoints (1 public webhook, 4 JWT-protected)
│   ├── billing.controller.ts                 # HTTP request handlers + raw-body webhook parsing
│   ├── billing.service.ts                    # Orchestration: checkout, webhook, status, history, student-verify
│   ├── billing.repository.ts                 # SQL CRUD: payments, webhook events, user subscriptions, expiry sweep
│   ├── billing.validators.ts                 # Zod schemas for checkout, student-verify, history query
│   └── expiry.worker.ts                      # BullMQ repeatable job for daily expiry downgrades
├── db/migrations/
│   ├── 024_create_payments.sql
│   ├── 025_create_subscription_webhook_events.sql
│   └── 026_alter_users_add_subscription_fields.sql
```

### Modified Files

| File | Change |
|------|--------|
| `src/config/env.ts` | Added M7 env vars (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, BILLING_EXPIRY_CRON) |
| `src/app.ts` | Added raw-body middleware for webhook route BEFORE global JSON parser; registered `/api/billing` routes |
| `src/jobs/queue.ts` | Added `billingExpiryQueue` + `createBillingExpiryWorker` |
| `src/worker.ts` | Integrated billing expiry worker with cron scheduler |
| `package.json` | Added `razorpay` dependency |
| `vitest.config.ts` | Added `globalSetup` for migration runner + `RAZORPAY_WEBHOOK_SECRET` env var |

### Webhook Architecture

```
Razorpay
  │  POST /api/billing/webhook
  │  x-razorpay-signature: <hmac-sha256>
  │  Body: raw JSON
  ▼
app.ts: express.raw({ type: "application/json" }) BEFORE global express.json()
  │
  ▼
billing.controller.ts
  │  Parse raw buffer → JSON
  │  Verify HMAC-SHA256 signature
  ▼
billing.service.ts
  │  Check idempotency (razorpay_event_id UNIQUE)
  │  Insert ledger event
  │
  ├── payment.captured → mark payment paid
  │                      update subscription_tier
  │                      set subscription_expires_at
  │
  └── payment.failed → mark payment failed
                       (no subscription change)
```

### Subscription Expiry Flow

```
Daily Cron (BILLING_EXPIRY_CRON, default: 3 AM)
       │
       ▼
  BullMQ Repeatable Job
       │
       ▼
  expiry.worker.ts
       │
       ▼
  SELECT users WHERE subscription_tier != 'free'
                  AND subscription_expires_at < NOW()
       │
       ├── For each: UPDATE users SET subscription_tier = 'free'
       └── Log count

Note: Free tier features remain accessible after expiry.
Pro-only features (e.g., mock interviews) return 403 UPGRADE_REQUIRED.
```

### Student Verification

Domain-based heuristic — not a hard enrollment gate:

| Domain Suffix | Match |
|---------------|-------|
| `.ac.in` | Indian academic institutions |
| `.edu.in` | Indian educational institutions |
| `.edu` | International educational institutions |

On submission, status is set to `pending`. Actual verification (→ `verified`) is handled externally. Until verified, the user remains on their current subscription tier.

---

## Milestone 8: B2B College Portal

**Scope:** Institution accounts, an `institution_admin` role (already in `user_role` enum from M1), student↔institution auto-linking via email domain matching, batch (cohort) definitions, consent-gated aggregate analytics for college cohorts, and a student-facing consent toggle.

**Builds on M1–M7:** Reuses the `authenticate` middleware, `query`/`queryOne` helpers, `rateLimiter` factory, `errorHandler`, `logger`, and migration runner. Reads aggregate data from M1 (onboarding), M2 (resumes/ATS scores), M3 (roadmap progress), M5 (interview scores), and M6 (job application funnel) — all read-aggregation, no new scoring logic.

### Implemented Features

| Feature | Status |
|---------|--------|
| `institutions` table (name, domain, contact_email) | ✅ |
| `institution_batches` table (institution, degree, graduation_year, label) | ✅ |
| `institution_id`, `batch_id`, `institution_data_sharing_consent` columns on `users` | ✅ |
| Email domain auto-matching at registration (`institutions.domain` lookup) | ✅ |
| Batch auto-linking at onboarding completion (degree + graduation_year match) | ✅ |
| Batch creation with retroactive backfill of matching unlinked students | ✅ |
| Institution admin batch listing (own institution only) | ✅ |
| Aggregate batch analytics (headcount, onboarding, resume, roadmap, interviews, jobs) | ✅ |
| Analytics computed only over consenting students (`consent = true` gate) | ✅ |
| `headcount.totalLinked` includes non-consenting students as count-only (no data leak) | ✅ |
| Named student roster (consenting students only) | ✅ |
| Cross-institution isolation (403 on batch ID guessing) | ✅ |
| Student-facing consent toggle (PATCH `/consent`, reversible) | ✅ |
| Student-facing "my institution" read-only view | ✅ |
| Zod validation on all college inputs | ✅ |
| Google OAuth registration also triggers domain auto-matching | ✅ |

### Routes

| Method | Endpoint | Auth | Role |
|--------|----------|------|------|
| POST | `/api/college/batches` | JWT | institution_admin (effective via ownership) |
| GET | `/api/college/batches` | JWT | Any (scoped to own institution) |
| GET | `/api/college/batch/:id` | JWT | institution_admin + ownership check |
| GET | `/api/college/batch/:id/students` | JWT | institution_admin + ownership check |
| PATCH | `/api/college/consent` | JWT | Any (self-service) |
| GET | `/api/college/my-institution` | JWT | Any |

### Database Migrations

| Migration | Description |
|-----------|-------------|
| 027 | `institutions` table with UNIQUE `domain` |
| 028 | `institution_batches` table with index on `(institution_id, degree, graduation_year)` |
| 029 | `institution_id`, `batch_id`, `institution_data_sharing_consent` columns on `users` |

### Files Created

```
src/
├── modules/college/
│   ├── college.routes.ts                    # 6 endpoints (admin batch mgmt + student consent/my-institution)
│   ├── college.controller.ts                # HTTP request handlers
│   ├── college.service.ts                   # Batch CRUD + analytics aggregation orchestration
│   ├── college.repository.ts                # SQL for institutions, batches, analytics queries across 6 tables
│   ├── college.validators.ts                # Zod schemas (create batch, consent toggle, students query)
│   └── institution-matching.service.ts      # Domain-match at registration, batch auto-link at onboarding
├── db/migrations/
│   ├── 027_create_institutions.sql
│   ├── 028_create_institution_batches.sql
│   └── 029_alter_users_add_institution_fields.sql
```

### Modified Files

| File | Change |
|------|--------|
| `src/app.ts` | Registered `/api/college` routes |
| `src/modules/auth/auth.service.ts` | Added `InstitutionMatchingService.linkUserToInstitution()` call after registration |
| `src/modules/auth/google-oauth.service.ts` | Added `InstitutionMatchingService.linkUserToInstitution()` call after Google user creation |
| `src/modules/auth/auth.repository.ts` | Added `institution_id`, `batch_id`, `institution_data_sharing_consent` to `UserRow` and `getPublicUserProfile` |
| `src/modules/onboarding/onboarding.service.ts` | Added `InstitutionMatchingService.autoLinkBatch()` call after onboarding completion |

### Institution Linking Flow

```
REGISTRATION (email/password or Google OAuth)
┌──────────┐  POST /register   ┌──────────────┐
│ Frontend │ ────────────────► │  Auth Service │
│          │                   │              │
│          │                   │ Create user   │
│          │                   │              │
│          │                   │  Extract email domain → institutions.domain lookup
│          │                   │  ↓ Match? Set users.institution_id
│          │                   │              │
│          │                   │  Continue with verification email...
└──────────┘                   └──────────────┘

ONBOARDING COMPLETION
┌──────────┐  POST /complete  ┌──────────────────┐
│ Frontend │ ────────────────► │ Onboarding Service│
│          │                   │                   │
│          │                   │  Mark onboarding  │
│          │                   │  completed = true  │
│          │                   │                   │
│          │                   │  Look up institution_batches
│          │                   │  WHERE (institution_id, degree, graduation_year)
│          │                   │  ↓ Match? Set users.batch_id
└──────────┘                   └──────────────────┘

BATCH CREATION (institution_admin)
┌──────────┐  POST /batches   ┌──────────────┐
│  Admin UI │ ──────────────► │ College Service│
│           │                  │                │
│           │                  │  INSERT batch   │
│           │                  │                │
│           │                  │  Backfill: UPDATE users
│           │                  │  SET batch_id = :newId
│           │                  │  WHERE institution_id = :inst
│           │                  │    AND degree = :deg
│           │                  │    AND graduation_year = :yr
│           │                  │    AND batch_id IS NULL
└───────────┘                  └────────────────┘
```

### Analytics Aggregation

For a given batch, `GET /api/college/batch/:id` runs (all scoped to `batch_id = :id AND institution_data_sharing_consent = true`):

| Metric | Source | Computation |
|--------|--------|-------------|
| Headcount | `users` | `COUNT(*)` linked vs. `COUNT(*) FILTER (WHERE consent)` |
| Onboarding completion | `users` | % with `onboarding_completed = true` |
| Resume upload rate | `resumes` | % with at least one active resume |
| Avg ATS score | `resumes` | Average `ats_score` across active resumes |
| Avg dimension scores | `resumes` | Per-dimension average of `dimension_scores` JSONB |
| Roadmap completion | `roadmap_items` | Average % of items marked complete |
| Interviews completed | `interview_sessions` | Count of completed sessions |
| Avg interview score | `interview_sessions` | Average `total_score` |
| Job application funnel | `job_applications` | Count by status (`applied`, `interview`, `offer`, `rejected`) |

### Consent Architecture

```
Data sharing consent gate (institution_data_sharing_consent):
  - DEFAULT false (opt-in)
  - Toggled by student via PATCH /api/college/consent
  - Affects ALL institution-facing views (analytics + roster)
  - headcount.totalLinked is the only field reflecting non-consenting students (as a bare count)
  - Revoking consent immediately excludes student from future queries
```

### Security Model

- Role check (`institution_admin`) and ownership check (`batch.institution_id = admin.institution_id`) on every batch/analytics endpoint
- Cross-institution batch ID guessing returns 403, not 404 (prevents existence probing)
- Consent gate applies uniformly to both aggregate analytics and named roster
- `institution_admin` accounts have no access to student-facing endpoints from M1–M7
- The `user_role` enum (`student`, `institution_admin`) was already defined in migration 001 — no new role migration needed
```
