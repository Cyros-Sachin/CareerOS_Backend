# CareerOS Backend — Milestone 4: AI Mentor

**Scope:** Conversational AI career mentor with SSE-streamed responses, persisted conversation history, full-context prompt injection (profile + resume + chat history), tiered Redis rate limiting, GitHub profile audit, response caching, and a content-safety filter. Per SRS FR-5 and flow §3.4.

**Builds directly on M1 + M2 + M3.** Reuses: `authenticate` middleware, `pool.ts` query helpers, `rateLimiter` factory, `errorHandler`, `logger`, migration runner, the provider-agnostic AI interface pattern from `src/lib/ai/` (Gemini 2.5 Flash default, OpenAI fallback), `resumes.parsed_data` (skills/projects/education for context injection), `users.career_goals`/`skill_level`/`subscription_tier` (mentor tier gating reuses the same column M2 used for scan limits), and the shared Redis connection from M1's rate limiter / M2's BullMQ.

**Status: PLANNED — not yet implemented.** This guide is the build spec for M4, written against the M1–M3 codebase as it actually exists today.

**Note on M3 scope:** the M3 guide's own architecture table stubbed roadmap PDF export as a `501 Not Implemented` endpoint deferred to "M4." Per the actual milestone roadmap, PDF export is delivered **within M3**, not here — M4 is AI Mentor only. If the M3 PDF-export stub is still live in the codebase when M4 work starts, closing it out belongs to M3's backlog, not this milestone; it isn't included in M4's scope below.

---

## 1. Architecture decisions (proposed)

| Concern | Decision | Why |
|---|---|---|
| Streaming transport | **SSE (Server-Sent Events)**, not WebSockets | FR-5.1 explicitly specifies SSE; one-directional server→client stream is all a chat response needs, and it rides on plain HTTP (no extra infra, unlike M2's resume-status polling which stayed plain poll/REST) |
| AI provider | Reuses M2/M3's provider-agnostic interface — new `MentorChatService` in `src/lib/ai/`, same `AI_PROVIDER` env switch (Gemini 2.5 Flash default, streaming-capable on both providers) | Consistency; streaming chat completions are supported natively by both the Gemini and OpenAI SDKs already in the dependency tree |
| Conversation storage | New `conversations` + `conversation_messages` tables (not a JSONB blob on `users`) | Normalized rows let "last 10 messages" (context window) and "last 50 messages" (page-load history, FR-5.2) be two different bounded queries against the same table, and let response caching (FR-5.7) key off individual message content |
| Context injection | Built server-side per request: user profile fields + `resumes.parsed_data` (active resume only) + last 10 `conversation_messages` rows, assembled into the system prompt | FR-5.3 — context lives in the prompt, not in a separate vector store; conversation length here doesn't justify RAG/embeddings the way the M3 skills taxonomy did |
| Rate limiting | Redis-backed, reuses M1's `rateLimiter` factory shape but with a **daily** window (not per-minute/per-hour like M1's auth limits) — `free=10/day`, `student=100/day`, `pro=unlimited` | FR-5.4 / SRS flow 3.4 step 3, exact tiers specified in the SRS |
| Response caching | Redis key `mentor:cache:{userId}:{sha256(normalizedQuestion)}`, 24h TTL | FR-5.7 — "identical questions from same user within 24hrs served from cache." Hashing avoids storing raw question text as a key (length/encoding safety), normalized (lowercased, trimmed) so trivial rephrasing differences don't both miss and don't accidentally over-match either |
| GitHub audit | Server-side `fetch` to GitHub's public REST API (no auth token required for public profile/repo data; optional `GITHUB_TOKEN` env var to raise the public rate limit from 60/hr to 5000/hr) | FR-5.6 — "AI fetches and audits public profile." No GitHub OAuth needed since only public data is read |
| Content safety filter | Two-stage: (1) cheap keyword/regex pre-filter on the user's incoming message (off-topic/harmful patterns) before any LLM call, (2) provider-side safety settings on the LLM call itself (Gemini safety categories / OpenAI moderation endpoint) | FR-5.8 — stage 1 saves an LLM call entirely for obvious cases (cost + latency), stage 2 catches what slips past keyword matching |
| Streaming implementation | Express response with `Content-Type: text/event-stream`, manual `res.write()` per chunk, `res.flushHeaders()` before first chunk, heartbeat comment (`:ping\n\n`) every 15s to keep proxies/load balancers from idling out the connection | Vercel/most reverse proxies buffer or time out idle HTTP connections; an explicit heartbeat is cheap insurance, especially relevant once this sits behind Vercel Edge per the SRS's architecture diagram |
| Validation | Zod, same pattern as M1–M3 | Consistency |

### Key deviations from the original SRS flow

- **No separate vector store / RAG for mentor context.** SRS §1.3 defines RAG as a term in scope for the platform overall (used for Job Matching in M6), but flow §3.4 step 4 just says "context: user profile + resume parsed data + conversation history (last 10 messages)" — a flat prompt, not retrieval. M4 follows the flow doc literally rather than over-engineering a vector lookup for a context window that fits comfortably in a single prompt.
- **GitHub audit is read-only and unauthenticated by default.** FR-5.6 doesn't specify OAuth, and auditing a public profile/repo list doesn't need it. `GITHUB_TOKEN` is optional, purely to avoid the 60-req/hr unauthenticated rate ceiling if usage is high — not a security requirement.
- **Caching is per-user, not global.** A tempting optimization would be a global cache keyed only on the question (since many users ask similar things), but that would mean one user's cached response — built from *their* profile/resume context — gets served to a different user without re-running the context-aware prompt. Per-user keying is slightly less cache-efficient but avoids ever leaking one person's tailored answer as a near-miss for someone else.
- **Moderation/safety stage 2 is provider-side, not a separate OpenAI Moderation API call when running on Gemini.** Calling a second provider's moderation endpoint while the primary chat call is on a different provider would add cross-provider coupling M2/M3 deliberately avoided. Each provider's own safety settings are used for whichever provider is active.

---

## 2. Files to be created (additions to existing structure)

```
src/
├── lib/
│   └── ai/
│       ├── mentor-chat.interface.ts     # MentorChatService interface (streaming generator pattern)
│       ├── gemini-mentor.provider.ts    # Gemini 2.5 Flash streaming implementation
│       ├── openai-mentor.provider.ts    # OpenAI GPT-4o streaming implementation
│       └── content-safety.ts            # Stage-1 keyword/regex pre-filter, provider-agnostic
├── modules/
│   └── mentor/
│       ├── mentor.routes.ts        # 4 endpoints, all JWT-protected
│       ├── mentor.controller.ts    # SSE response handling (res.write, headers, heartbeat)
│       ├── mentor.service.ts       # Orchestration: rate check → cache check → context build → stream → persist
│       ├── mentor.repository.ts    # Raw SQL for conversations + conversation_messages
│       ├── mentor.validators.ts    # Zod schemas
│       └── github-audit.service.ts # GitHub public API fetch + summarization prompt builder
├── db/migrations/
│   ├── 014_create_conversations.sql
│   └── 015_create_conversation_messages.sql
└── tests/
    ├── mentor.test.ts               # Integration tests (mock AI provider, real DB, SSE response parsing)
    └── content-safety.test.ts       # Unit tests for stage-1 keyword filter (no DB, no network)
```

---

## 3. Database schema (migrations 014–015)

### `conversations`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK, default gen_random_uuid() | |
| user_id | UUID FK → users.id, CASCADE | |
| title | VARCHAR(255), nullable | Auto-generated from first message (truncated), shown in a future conversation-list UI |
| created_at | TIMESTAMP, DEFAULT NOW() | |
| updated_at | TIMESTAMP, DEFAULT NOW() | Auto-updated via trigger, bumped on each new message |

One open question (see §11): whether CareerOS supports multiple named conversations per user or a single ongoing thread. Schema supports either; M4 ships with **one active conversation per user**, auto-created on first message — multi-conversation UI is a FE decision for later.

### `conversation_messages`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| conversation_id | UUID FK → conversations.id, CASCADE | |
| user_id | UUID FK → users.id, CASCADE | Denormalized for direct rate-limit / cache queries without a join |
| role | ENUM('user','assistant'), NOT NULL | |
| content | TEXT, NOT NULL | |
| is_cached_response | BOOLEAN, DEFAULT false | Set true when served from the FR-5.7 cache, for observability |
| flagged_by_safety_filter | BOOLEAN, DEFAULT false | Set true when stage-1 or stage-2 filter blocked/altered the exchange — never deleted, kept for audit |
| created_at | TIMESTAMP, DEFAULT NOW() | |

Index: `(conversation_id, created_at)` for ordered history fetch; `(user_id, created_at)` for the 24h cache/rate-limit lookups.

---

## 4. API contract (proposed)

All endpoints require `Authorization: Bearer <accessToken>`.

| Method | Endpoint | Body / Query | Purpose |
|---|---|---|---|
| GET | `/api/mentor/history` | `?limit=50` | FR-5.2 — last N messages for the user's conversation, loaded on `/mentor` page open |
| POST | `/api/mentor/chat` | `{ message: string }` | Per SRS §2.3 — streams response via SSE; persists both user message and assistant response on completion |
| GET | `/api/mentor/suggested-prompts` | — | FR-5.5 — returns 6 example questions (static list, lightly personalized by `career_goals` if present) |
| POST | `/api/mentor/github-audit` | `{ githubUrl: string }` | FR-5.6 — fetches public profile, returns AI-generated audit summary (non-streaming, single JSON response) |

### Chat streaming flow

```
Client                      API                    Redis              Postgres           AI Provider
  │  POST /chat               │                       │                   │                   │
  │ ─────────────────────────►│                        │                   │                   │
  │                           │  rate limit check      │                   │                   │
  │                           │ ──────────────────────► │                   │                   │
  │                           │ ◄────────────────────── │  (ok / 429)       │                   │
  │                           │                        │                   │                   │
  │                           │  stage-1 safety filter │                   │                   │
  │                           │  (in-process, no I/O)  │                   │                   │
  │                           │                        │                   │                   │
  │                           │  cache check (sha256   │                   │                   │
  │                           │  of normalized message)│                   │                   │
  │                           │ ──────────────────────► │                   │                   │
  │                           │ ◄────────────────────── │  hit → skip to    │                   │
  │                           │                        │  stream cached    │                   │
  │                           │                        │  text in chunks   │                   │
  │                           │                        │                   │                   │
  │                           │  [cache miss path]      │                   │                   │
  │                           │  fetch profile + active │                   │                   │
  │                           │  resume + last 10 msgs  │                   │                   │
  │                           │ ───────────────────────────────────────────►│                   │
  │                           │ ◄───────────────────────────────────────────│                   │
  │                           │                        │                   │                   │
  │                           │  build system prompt    │                   │                   │
  │                           │  request streaming      │                   │                   │
  │                           │  completion             │                   │                   │
  │                           │ ──────────────────────────────────────────────────────────────► │
  │  res.flushHeaders()        │ ◄────────────────────────────────────────────────────────────── │
  │  text/event-stream         │  chunk 1, chunk 2, ...  (provider-side safety stage 2 inline)    │
  │ ◄──────────────────────── │ ◄────────────────────────────────────────────────────────────── │
  │  data: {...}\n\n           │                        │                   │                   │
  │  (repeats per chunk)       │                        │                   │                   │
  │                           │  on stream end:         │                   │                   │
  │                           │  persist user msg +     │                   │                   │
  │                           │  assistant msg, cache    │                   │                   │
  │                           │  full response, decrement│                  │                   │
  │                           │  rate-limit counter      │                   │                   │
  │                           │ ──────────────────────► │ ─────────────────►│                   │
  │  data: [DONE]\n\n           │                        │                   │                   │
```

---

## 5. Context injection (`mentor.service.ts`)

System prompt assembled from, in order:

1. **Fixed instruction block** — "You are CareerOS Mentor..." (FR matches flow §3.4 step 5 wording), plus the stage-1/stage-2 safety framing (e.g. staying on-topic for career guidance).
2. **User profile** — name, college, degree, graduation year, career goals, skill level, subscription tier (so the mentor can correctly say "mock interviews are a Pro feature" etc. without a separate lookup).
3. **Active resume summary** — skills/projects/education/experience from `resumes.parsed_data` (not the raw extracted text — keeps the prompt smaller and avoids leaking PII-heavy raw text per the PII-logging discipline carried over from M2).
4. **Conversation history** — last 10 `conversation_messages` rows (5 exchanges), oldest first.
5. **The new user message.**

Token budget is not aggressively optimized in M4 — profile + resume summary + 10 messages comfortably fits both providers' context windows. Revisit if conversation length or resume summary size becomes a real cost driver (see §11).

---

## 6. Rate limiting & caching

| Tier | Daily limit | Enforcement |
|---|---|---|
| free | 10/day | Redis key `mentor:count:{userId}:{YYYY-MM-DD}`, INCR + EXPIRE at day boundary |
| student | 100/day | Same mechanism, different ceiling read from `subscription_tier` |
| pro | unlimited | Skips the check entirely |

- Counter increments **after** a successful (non-cached, non-filtered) response — a request blocked by the safety filter or served from cache doesn't count against the daily limit. This matches the spirit of FR-5.4 (limiting actual AI Mentor *usage*, not blocked or free cache hits) and keeps the cache (FR-5.7) actually useful for free-tier users instead of being pointless if cache hits still burned quota.
- Cache entries (`mentor:cache:{userId}:{hash}`, 24h TTL) store the full assistant response text, replayed as artificial SSE chunks on a hit so the client-side streaming UI behaves identically whether the answer came fresh or cached.

---

## 7. GitHub audit (`github-audit.service.ts`)

- Accepts a GitHub profile URL, extracts the username, calls GitHub's public REST API (`/users/{username}`, `/users/{username}/repos?sort=updated`) — no auth required for public data; `GITHUB_TOKEN` env var optional, only to raise the rate ceiling.
- Builds a structured summary (repo count, languages used, most recently active repos, presence/absence of READMEs, pinned-worthy projects heuristic) and passes that — not raw API JSON — into a single LLM prompt for a qualitative audit, returned as one JSON response (not streamed; this is a one-shot analysis, not a chat turn).
- Result is **not persisted** to `conversation_messages` in M4 — it's a standalone tool, not part of the chat thread. Whether it should surface as a chat message later is a product question, not blocking for this milestone.

---

## 8. Content safety filter (`content-safety.ts`)

- **Stage 1 (pre-LLM):** keyword/regex pattern list for clearly off-topic or harmful categories, checked against the incoming user message before any provider call. A match short-circuits with a canned, non-judgmental redirect response (e.g., steering back to career topics) — `flagged_by_safety_filter = true` is recorded, but the message **is still persisted** (never silently dropped — needed for audit/abuse-pattern review).
- **Stage 2 (provider-side):** Gemini's safety category settings / OpenAI's moderation endpoint, applied to both the user's message and the model's own output. If the provider flags content the stage-1 filter missed, the partial stream is cut and replaced with the same canned redirect.
- Pattern list lives in `content-safety.ts` as a maintainable array, not hardcoded inline in the service — keeping it editable without touching orchestration logic.

---

## 9. Security & rate limiting (additional)

- **`POST /mentor/chat`** itself has no separate per-minute IP rate limit beyond the daily tier limit above — the daily cap already bounds abuse; adding a per-minute limit on top mainly protects against a single user hammering the endpoint within their daily allowance, which is a minor concern given SSE responses naturally throttle request pacing (a client can't usefully fire many chat requests per second while one is still streaming).
- **`POST /mentor/github-audit`** rate-limited separately (10/hour/user) since it's a heavier multi-call operation (GitHub API + LLM) not covered by the chat daily counter.
- Github audit input validated as a well-formed GitHub profile URL via Zod before any outbound fetch — avoids the service being used as an open URL-fetch proxy.

---

## 10. Test coverage (planned)

### `tests/content-safety.test.ts` (unit — no DB, no network)
| Test | Covers |
|---|---|
| Off-topic/harmful keyword pattern flags message | FR-5.8 stage 1 |
| Career-related message passes stage 1 cleanly | False-positive check |
| Flagged message still returns a non-empty redirect response | UX requirement (never silently drop) |

### `tests/mentor.test.ts` (integration — mock AI provider, real DB, SSE parsing)
| Test | Covers |
|---|---|
| First message auto-creates a conversation | Schema / flow |
| Chat response streamed as valid SSE chunks, persisted on completion | FR-5.1/5.2 |
| History endpoint returns last 50 messages in order | FR-5.2 |
| Free-tier 11th request in a day → 429 | FR-5.4 |
| Student-tier 100th vs 101st request boundary | FR-5.4 |
| Pro tier — no limit enforced after 150 requests in test | FR-5.4 |
| Identical question within 24h served from cache, `is_cached_response = true` | FR-5.7 |
| Cached response doesn't decrement daily rate-limit counter | §6 design intent |
| Suggested prompts endpoint returns exactly 6 items | FR-5.5 |
| GitHub audit — valid public profile returns structured summary | FR-5.6 |
| GitHub audit — malformed URL rejected by validator (400) | Input safety |
| 401 without auth token on all 4 endpoints | Security |

---

## 11. Known risks / open decisions before build

- **Single conversation per user vs. multiple named threads:** M4 ships single-thread. If the product wants ChatGPT-style multiple conversations later, the schema already supports it (`conversations` is already a separate table from `users`) — but the "auto-create on first message" + "always fetch *the* conversation" service logic in M4 would need a conversation-ID parameter threaded through every endpoint. Worth deciding before significant FE investment in a single-thread UI.
- **Context window cost as resumes/history grow:** profile + resume summary + 10 messages is cheap today. If resumes get notably more detailed (post-M3 roadmap data, post-M6 job-match history) the prompt could grow enough to matter for cost/latency — no truncation/summarization strategy is built in M4, flagged for revisit.
- **Cache hit rate in practice is unknown.** FR-5.7's "identical questions... within 24hrs" assumes meaningful repeat-question behavior; per-user normalized-hash caching is implemented per spec, but whether it materially reduces AI spend depends on real usage patterns CareerOS doesn't have data on yet.
- **SSE through Vercel Edge:** the SRS architecture diagram (§2.1) routes through Vercel Edge. Vercel's serverless functions have historically had constraints around long-lived streaming responses depending on runtime (Edge vs. Node serverless functions behave differently here) — this should be verified against current Vercel docs at implementation time rather than assumed, since it directly affects whether the heartbeat/timeout approach in §1 is sufficient or whether a different runtime target is needed.

---

## 12. What M4 does NOT include (deferred)

- Multiple named conversation threads per user — open product decision, see §11
- Conversation summarization/truncation for long-running threads — deferred until context size becomes a real cost concern
- GitHub audit results persisted into the chat thread — currently a standalone tool response
- Mock Interviews (FR-6) — M5
- Job Matching (FR-6 in SRS flow numbering / §3.6) — M6
- Any Razorpay/plan-upgrade flow triggered from mentor's tier-gating mentions (e.g. mentor telling a free user "upgrade for unlimited") — mentor can *say* this contextually since `subscription_tier` is in the prompt, but the upgrade flow itself is M7
