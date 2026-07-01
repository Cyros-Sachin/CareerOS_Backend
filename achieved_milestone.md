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

### Scoring Dimensions

| Dimension | Technical | System Design | HR |
|-----------|-----------|---------------|-----|
| Correctness / Soundness | Algorithm correctness, edge cases | Design meets requirements | Addresses the question |
| Complexity / Trade-off Awareness | Time/space complexity | Scalability, trade-offs | Depth of reflection |
| Communication Clarity | Approach explanation | Design rationale clarity | Structure (STAR) |
| Best Practices | Code style, naming | Patterns (caching, sharding) | Professionalism, examples |
| Completeness | Full solution | Major components covered | All parts answered |

### Files Created

```
src/
├── lib/ai/
│   ├── interview-question-gen.interface.ts   # InterviewAIService interface
│   ├── interview-scoring.ts                  # 5-dimension scoring + aggregation
│   ├── gemini-interview.provider.ts          # Gemini question-gen + eval
│   └── openai-interview.provider.ts          # OpenAI question-gen + eval
├── modules/
│   └── interview/
│       ├── interview.routes.ts               # 8 endpoints with auth + rate limiting
│       ├── interview.controller.ts           # HTTP request handlers
│       ├── interview.service.ts              # Orchestration: start → submit → complete → report
│       ├── interview.repository.ts           # SQL queries for sessions/questions/answers
│       ├── interview.validators.ts           # Zod schemas for all interview inputs
│       └── dimension-score-sync.service.ts   # Writes Interview Readiness → resume dimension_scores
├── db/migrations/
│   ├── 016_create_interview_sessions.sql
│   ├── 017_create_interview_questions.sql
│   └── 018_create_interview_answers.sql
```
