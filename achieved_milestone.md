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
