# CareerOS Backend — Milestone 5: Mock Interviews

**Scope:** AI-generated mock interview sessions across three modes (Technical / System Design / HR-Behavioral), server-enforced session timers, per-answer real-time AI evaluation, post-session composite reports, interview history, and a feedback loop that writes the result back into the resume's **Interview Readiness** dimension score. Per SRS FR-6 and flow §3.5.

**Builds directly on M1 + M2 + M3 + M4.** Reuses: `authenticate` middleware, `pool.ts` query helpers, `rateLimiter` factory, `errorHandler`, `logger`, migration runner, the provider-agnostic AI interface in `src/lib/ai/` (Gemini 2.5 Flash default, OpenAI fallback — same pattern M2's parsing, M3's roadmap generation, and M4's chat streaming all use), `users.subscription_tier` (Pro-gating reuses the same column M2 used for scan limits and M4 used for daily message tiers), `users.career_goals` / `skill_level` (question generation targets these same fields M3's gap analysis already reads), and `resumes.dimension_scores` JSONB (M2's 6-dimension ATS score object — Interview Readiness is dimension 5 of that object, and this milestone is what actually populates it with real data instead of resume-text heuristics alone).

**Status: PLANNED — not yet implemented.** This guide is the build spec for M5, written against the M1–M4 codebase as it actually exists today.

**Note on scope boundary with M4:** M4's own closing section explicitly deferred "Mock Interviews (FR-6)" to M5 — this guide is that deferred work. Nothing here touches `conversations` / `conversation_messages`; mock interviews are a separate feature surface from the AI Mentor chat, even though both call into `src/lib/ai/`.

---

## 1. Architecture decisions (proposed)

| Concern | Decision | Why |
|---|---|---|
| Question generation | One-shot LLM call at session start generating exactly 5 questions, Zod-validated JSON array, 1 retry on schema failure — same forced-JSON pattern M3 used for roadmap generation | FR-6.3 — "5 questions per session, tailored to user's target role + skill level"; reusing the forced-JSON + retry pattern keeps generation consistent with M3 rather than inventing a new AI-call shape |
| Per-answer evaluation timing | Each answer is scored by the AI **as soon as it's submitted**, not deferred to one big call at session end | SRS flow §3.5 step 7 says "Each answer submitted → AI evaluates in real-time" — this is explicit in the flow, not an implementation choice. It also means a session abandoned after 3/5 questions still has 3 real scores on record, and the final report step becomes aggregation of already-computed scores rather than one large end-of-session LLM call |
| Session timer enforcement | Server-authoritative: `started_at` + `time_limit_seconds` stored at session creation; every write to an answer checks `NOW() < started_at + time_limit_seconds` server-side, not just a client-side countdown | A client-only timer is trivially bypassable by pausing/editing local state; FR-6.4's timer requirement has to be enforced where it can't be tampered with. Late submissions aren't silently rejected — they're accepted and flagged `submitted_late = true`, since a harsh hard-cutoff mid-answer would lose user work for the sake of strictness the SRS doesn't actually demand |
| Answer autosave | `PATCH` endpoint, client-polled every 30s, writes raw `answer_text` only — **no AI call on autosave**, evaluation only happens on explicit submit | FR-6.5 — "answer auto-saved every 30 seconds to prevent loss." Running the evaluator on every autosave would be 1) wasteful (partial/mid-typing text isn't a real answer yet) and 2) impossible to reconcile with "real-time evaluation on submit" from step 7 — autosave and evaluation are deliberately two different triggers |
| Technical mode language | `language` field (`javascript / python / java / cpp`) stored per-question on the technical path only; FE renders Monaco with that language, BE has no code-execution sandbox | FR-6.2 — Monaco editor with language selection. Actually *running* submitted code isn't in FR-6 (evaluation is AI-assessment of correctness/approach, not a test-runner), so no sandboxed execution service is built here — that would be a materially larger scope than what FR-6 asks for |
| Report generation | `POST /interview/:sessionId/complete` aggregates the per-answer scores already computed at submit time into a composite report (weighted average across 5 dimensions per answer, then averaged across questions), rather than issuing a fresh LLM call | Consistent with the per-answer evaluation decision above — the "post-session report" (FR-6.7) is a deterministic aggregation step, not a second AI pass re-deciding scores the model already committed to per-question |
| Interview Readiness feedback loop | On session completion, the session's composite score is written into the **active** resume's `dimension_scores.interviewReadiness` (M2's JSONB column), and `resumes.ats_score` is recomposed using M2's existing weighted-composite formula | SRS flow §3.5 step 10 — "Scores from interview feed back into overall Interview Readiness dimension." This reuses M2's scoring engine's composite-recalculation logic rather than duplicating it; M5 only supplies a new value for one of the six inputs M2 already knows how to combine |
| Pro-tier gating | Reuses M2/M3/M4's `subscription_tier` check pattern — `POST /interview/start` returns `403` with an upgrade-CTA payload for `free`/`student` tiers | FR-6.10 — "Available on Pro plan only; show upgrade CTA to Student/Free users." Same gating shape as M4's mentor tier checks, just a hard block instead of a rate-limited allowance since there's no free-tier quota mentioned for interviews (unlike mentor chat) |
| Validation | Zod, same pattern as M1–M4 | Consistency |

### Key deviations from the original SRS flow

- **No code execution sandbox for Technical mode.** FR-6.2 asks for a Monaco editor with language selection, and evaluation (FR-6.6) asks for AI-scored answers across 5 dimensions — neither requirement says submitted code must actually *run* against test cases. Building a sandboxed executor (Docker-in-Docker or a service like Judge0) would be a substantial infra addition unsupported by anything in FR-6's text; the AI evaluator assesses code the same way a human interviewer reading a whiteboard solution would — for correctness of approach, complexity, and edge-case awareness — not via execution.
- **Real-time evaluation is per-answer, not a single end-of-session batch call.** This is actually *not* a deviation — flow §3.5 step 7 states it directly — but it's called out because it's easy to misread FR-6.7's "post-session report" as implying one big final AI call. It's an aggregation step over five already-scored answers instead.
- **Timer is a soft server-side flag, not a hard cutoff.** SRS FR-6.4 specifies a session timer but doesn't specify what happens on expiry. A hard server-side rejection of any write past the deadline was considered and rejected in favor of flagging + accepting, to avoid destroying in-progress user work over a UX detail the SRS is silent on. Worth revisiting if product wants strict enforcement (see §11).
- **System Design mode reuses the HR mode's rich-text answer shape**, not the Monaco editor — FR-6.2 only specifies Monaco for Technical mode; System Design answers (diagram description, trade-off reasoning) map more naturally to prose than code, so it follows HR's input shape rather than inventing a third answer UI in this milestone. A dedicated diagramming input is a plausible future enhancement, not part of M5.

---

## 2. Files to be created (additions to existing structure)

```
src/
├── lib/
│   └── ai/
│       ├── interview-question-gen.interface.ts   # QuestionGeneratorService interface
│       ├── gemini-interview.provider.ts          # Gemini question-gen + answer-eval implementation
│       ├── openai-interview.provider.ts          # OpenAI question-gen + answer-eval implementation
│       └── interview-scoring.ts                  # 5-dimension answer scoring prompt builder + Zod schema
├── modules/
│   └── interview/
│       ├── interview.routes.ts             # 7 endpoints, all JWT + Pro-gated (except history read)
│       ├── interview.controller.ts         # Request handling, timer checks, upgrade-CTA responses
│       ├── interview.service.ts            # Orchestration: start → question-gen → answer submit/eval → complete → report
│       ├── interview.repository.ts         # Raw SQL for sessions + questions + answers
│       ├── interview.validators.ts         # Zod schemas (mode/difficulty/topic/language enums, answer payloads)
│       └── dimension-score-sync.service.ts # Writes composite score into resumes.dimension_scores, recomposes ats_score (calls into M2's existing composite-scoring function)
├── db/migrations/
│   ├── 016_create_interview_sessions.sql
│   ├── 017_create_interview_questions.sql
│   └── 018_create_interview_answers.sql
└── tests/
    ├── interview.test.ts                # Integration tests (mock AI provider, real DB)
    └── interview-scoring.test.ts        # Unit tests for the composite-aggregation math (no DB, no network)
```

---

## 3. Database schema (migrations 016–018)

### `interview_sessions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK, default gen_random_uuid() | |
| user_id | UUID FK → users.id, CASCADE | |
| mode | ENUM('technical','system_design','hr'), NOT NULL | FR-6.1 |
| difficulty | ENUM('easy','medium','hard'), nullable | Technical mode only (FR-6.2) |
| topic | VARCHAR(100), nullable | Technical mode only, e.g. "DSA", "Web Dev" (FR-6.2) |
| target_role | VARCHAR(100), NOT NULL | Snapshot of `users.career_goals`-derived target role at session start, so a later goal change doesn't retroactively alter a completed session's context |
| status | ENUM('in_progress','completed','abandoned'), DEFAULT 'in_progress' | |
| time_limit_seconds | INTEGER, NOT NULL | 2700 (45 min) for technical/system_design, 1800 (30 min) for hr — per FR-6.4 |
| total_score | INTEGER, nullable | 0–100 composite, set on completion |
| started_at | TIMESTAMP, DEFAULT NOW() | Timer origin |
| completed_at | TIMESTAMP, nullable | |
| created_at | TIMESTAMP, DEFAULT NOW() | |

Index: `(user_id, created_at DESC)` for the history endpoint.

### `interview_questions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| session_id | UUID FK → interview_sessions.id, CASCADE | |
| question_order | SMALLINT, NOT NULL | 1–5 |
| question_text | TEXT, NOT NULL | |
| language | VARCHAR(20), nullable | Technical mode only — javascript/python/java/cpp |
| created_at | TIMESTAMP, DEFAULT NOW() | |

Unique constraint: `(session_id, question_order)`.

### `interview_answers`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| question_id | UUID FK → interview_questions.id, CASCADE, UNIQUE | One answer per question |
| session_id | UUID FK → interview_sessions.id, CASCADE | Denormalized for direct session-level aggregation without a join |
| answer_text | TEXT, nullable | Code (technical) or prose (system design / hr); nullable until first autosave |
| last_autosaved_at | TIMESTAMP, nullable | Bumped on every FR-6.5 autosave write |
| submitted_at | TIMESTAMP, nullable | Set on explicit submit; null = not yet submitted |
| submitted_late | BOOLEAN, DEFAULT false | True if `submitted_at > session.started_at + time_limit_seconds` |
| score | JSONB, nullable | 5-dimension breakdown, set by real-time evaluator on submit |
| feedback | TEXT, nullable | Per-question qualitative feedback |
| model_answer | TEXT, nullable | AI-generated reference answer, shown in the final report |
| created_at | TIMESTAMP, DEFAULT NOW() | |

Index: `(session_id)` for report aggregation.

---

## 4. API contract (proposed)

All endpoints require `Authorization: Bearer <accessToken>`. `POST /interview/start` additionally requires `subscription_tier = 'pro'`.

| Method | Endpoint | Body / Query | Purpose |
|---|---|---|---|
| POST | `/api/interview/start` | `{ mode, difficulty?, topic?, language? }` | FR-6.1/6.3 — creates session, generates 5 questions via LLM, returns session + question list. `403` with upgrade-CTA payload if not Pro |
| GET | `/api/interview/:sessionId` | — | Session detail: metadata, questions, any answers/scores so far (for resuming a page reload mid-session) |
| PATCH | `/api/interview/:sessionId/answers/:questionId` | `{ answerText }` | FR-6.5 — autosave, no AI call, client-polled every 30s |
| POST | `/api/interview/:sessionId/answers/:questionId/submit` | `{ answerText }` | FR-6.6 step 7 — final submit, triggers real-time AI evaluation, returns score + feedback + model answer for that question |
| POST | `/api/interview/:sessionId/complete` | — | FR-6.7 — aggregates all submitted answers into a composite report, writes Interview Readiness back to the active resume, marks session `completed` |
| GET | `/api/interview/:sessionId/report` | — | Full report: composite score, per-question feedback, model answers, improvement areas |
| GET | `/api/interview/history` | `?limit=20` | FR-6.8 — past sessions list, most recent first |

### Session lifecycle flow

```
Client                     API                    Postgres            AI Provider
  │  POST /interview/start  │                         │                    │
  │ ────────────────────────►│                         │                    │
  │                          │  check subscription_tier│                    │
  │                          │  = pro (else 403)       │                    │
  │                          │                         │                    │
  │                          │  generate 5 questions    │                    │
  │                          │  (target role + skill    │                    │
  │                          │  level + mode/difficulty) │                    │
  │                          │ ─────────────────────────────────────────────►│
  │                          │ ◄─────────────────────────────────────────────│
  │                          │  create session +         │                    │
  │                          │  5 question rows           │                    │
  │                          │ ────────────────────────►│                    │
  │ ◄──────────────────────── │  session + questions       │                    │
  │                          │                         │                    │
  │  (repeat per question)   │                         │                    │
  │  PATCH .../answers/:qId  │  autosave, no AI call     │                    │
  │ ────────────────────────►│ ────────────────────────►│                    │
  │                          │                         │                    │
  │  POST .../submit         │  check timer              │                    │
  │ ────────────────────────►│  evaluate answer           │                    │
  │                          │  (5-dimension scoring)     │                    │
  │                          │ ─────────────────────────────────────────────►│
  │                          │ ◄─────────────────────────────────────────────│
  │                          │  persist score+feedback   │                    │
  │                          │  +model_answer             │                    │
  │                          │ ────────────────────────►│                    │
  │ ◄──────────────────────── │  score + feedback          │                    │
  │                          │                         │                    │
  │  POST .../complete       │  aggregate 5 answer scores │                    │
  │  (after all 5 submitted) │  → composite total_score   │                    │
  │ ────────────────────────►│  write session.completed  │                    │
  │                          │  sync Interview Readiness  │                    │
  │                          │  → resumes.dimension_scores│                    │
  │                          │  recompose resumes.ats_score│                   │
  │                          │ ────────────────────────►│                    │
  │ ◄──────────────────────── │  report                    │                    │
```

---

## 5. Question generation (`interview-question-gen.interface.ts`)

Single LLM call at session start, forced-JSON output, Zod-validated array of exactly 5 questions, 1 retry on schema failure — matching M3's roadmap-generation pattern.

Prompt inputs, in order:

1. **Mode** — technical / system_design / hr, drives question style entirely.
2. **Difficulty + topic** (technical only) — e.g. "Medium, DSA" → array/graph/DP-style questions; "Hard, System Design" isn't applicable since difficulty is technical-only per FR-6.2's wording, but system_design questions still scale loosely by `skill_level`.
3. **Target role** — snapshotted from `users.career_goals` at session start (see schema note above).
4. **Skill level** — `users.skill_level` (beginner/mid/advanced), same field M3's gap analysis reads.
5. **Language** (technical only) — informs whether generated questions are language-agnostic algorithmic prompts or reference a specific ecosystem (e.g. "implement X in idiomatic Python" vs. a language-neutral DSA prompt with the editor merely defaulting to the chosen language).

Each generated question includes `question_order` (1–5) and, for technical mode, the chosen `language`.

---

## 6. Real-time answer evaluation (`interview-scoring.ts`)

Triggered on `POST /submit`, not on autosave (see §1). Each answer is scored independently against 5 dimensions — a fixed rubric applied consistently regardless of mode, with mode-appropriate weighting baked into the prompt (e.g. "Code Correctness" carries more weight for Technical, "Communication Clarity" for HR):

| Dimension | Technical emphasis | System Design emphasis | HR emphasis |
|---|---|---|---|
| Correctness / Soundness | Algorithm correctness, edge cases | Design meets stated requirements | Answer addresses the actual question asked |
| Complexity / Trade-off Awareness | Time/space complexity discussion | Scalability, trade-off reasoning | Depth of self-reflection |
| Communication Clarity | Explanation of approach, not just code | Clarity of design rationale | Structure (e.g. STAR method) |
| Best Practices | Code style, naming, structure | Standard patterns (caching, sharding, etc. where relevant) | Professionalism, specificity of examples |
| Completeness | Fully working solution vs. partial | Covers major system components | Fully answers all parts of a multi-part question |

Output per answer: `score` (JSONB, 0–100 per dimension), `feedback` (2–4 sentences, actionable), `model_answer` (a strong reference answer — not a "perfect" answer but a realistic strong one, kept for report display).

**Not shown to the user immediately.** Per-answer scores are computed and persisted at submit time but only surfaced in the final report (`GET /report`) after `POST /complete` — seeing a score for question 2 while questions 3–5 remain could visibly change how a candidate answers the rest, which SRS FR-6.6/6.7's "post-session report" framing implies is not the intended UX.

---

## 7. Report generation & Interview Readiness sync (`dimension-score-sync.service.ts`)

`POST /interview/:sessionId/complete`:

1. Confirms all 5 questions have a submitted answer (else `409` — incomplete session can't be completed; it can still be abandoned via a separate lightweight status update if the user navigates away, but that's a FE-driven `status = 'abandoned'` patch, not part of this endpoint's happy path).
2. Aggregates the 5 per-answer `score` JSONB objects into a single `total_score` (mean across questions of each answer's own weighted-dimension composite).
3. Builds the report payload: composite score, per-question feedback + model answers, and a short list of improvement areas (derived from the lowest-scoring dimension(s) across the 5 answers, not a fresh LLM call — a deterministic "which dimensions scored lowest" pass over already-computed data).
4. Writes `total_score` into the **active** resume's `dimension_scores.interviewReadiness` field (M2's JSONB column) via a call into M2's existing composite-recalculation function, which recomposes `resumes.ats_score` using the same weighted formula from FR-3.7 (Quality 15% + ATS 25% + Projects 25% + Experience 20% + Interview 10% + Market 5%).
5. Marks `interview_sessions.status = 'completed'`, sets `completed_at`.

If the user has no active resume (skipped resume upload during onboarding), step 4 is skipped gracefully — the interview report still generates and persists, it just doesn't feed a career score that doesn't exist yet.

---

## 8. Session timer enforcement

- `started_at` is set once, at session creation, and never reset.
- Every `PATCH` (autosave) and `POST /submit` computes `NOW() < started_at + time_limit_seconds` server-side.
- Autosave past the deadline still succeeds (no reason to lose typed work) but stops resetting any client-visible countdown — that's a FE display concern once the server-known deadline has passed.
- Submit past the deadline still succeeds and is evaluated normally, but `submitted_late = true` is recorded on the answer row, and the final report surfaces a note per late question rather than silently treating it as on-time. See §11 for the open question of whether this should instead be a hard cutoff.

---

## 9. Security & tier gating

- **`POST /interview/start`** checks `subscription_tier = 'pro'` before any AI call is made — a free/student user hitting this endpoint gets `403` with a structured `{ upgradeRequired: true, currentTier, feature: 'mock_interview' }` payload the FE uses to render the upgrade CTA (FR-6.10), rather than a generic 403.
- All other interview endpoints (`GET`/`PATCH`/`POST submit`/`complete`/`report`/`history`) additionally verify `session.user_id = req.user.id` — a Pro user cannot read or write another user's session by guessing a session ID.
- Technical-mode `answer_text` (code) is stored and displayed as-is; no code execution means no sandboxing/RCE surface to defend against — this is a direct benefit of the "no execution sandbox" decision in §1, not just a scope-reduction convenience.
- Zod validation on `mode`/`difficulty`/`topic`/`language` enums prevents free-text injection into the question-generation prompt beyond the fixed enum set.

---

## 10. Test coverage (planned)

### `tests/interview-scoring.test.ts` (unit — no DB, no network)
| Test | Covers |
|---|---|
| 5 per-question scores aggregate to correct composite total | §7 aggregation math |
| Lowest-scoring dimension(s) correctly identified for improvement-areas list | §7 step 3 |
| Aggregation handles a session with one `submitted_late = true` answer without excluding it from scoring | §8 — late doesn't mean unscored |

### `tests/interview.test.ts` (integration — mock AI provider, real DB)
| Test | Covers |
|---|---|
| Free/student tier `POST /start` → 403 with upgrade-CTA payload | FR-6.10 |
| Pro tier `POST /start` creates session + exactly 5 questions | FR-6.1/6.3 |
| Technical mode question includes `language` field; HR/system_design do not | FR-6.2 |
| Autosave (`PATCH`) does not trigger an AI provider call | §1 design intent |
| Submit triggers evaluation, persists score/feedback/model_answer | FR-6.6 |
| Submit after timer expiry still succeeds, `submitted_late = true` | §8 |
| `POST /complete` before all 5 answered → 409 | §7 step 1 |
| `POST /complete` after all 5 answered → composite score, `status = 'completed'` | FR-6.7 |
| Completion writes `dimension_scores.interviewReadiness` and recomposes `ats_score` on active resume | FR-6.9 / SRS flow step 10 |
| Completion with no active resume still succeeds, skips dimension sync | §7 graceful-skip case |
| History endpoint returns sessions most-recent-first | FR-6.8 |
| Cross-user session access → 403 | Security |
| 401 without auth token on all 7 endpoints | Security |

---

## 11. Known risks / open decisions before build

- **Soft timer enforcement (flag, not hard cutoff) is an interpretation, not an explicit SRS requirement.** FR-6.4 specifies timer durations but not enforcement behavior on expiry. If product wants a hard cutoff (auto-submit whatever's typed at the deadline, or lock the input), that changes both the autosave and submit endpoint contracts — worth confirming before FE builds a countdown UI around one assumption or the other.
- **No code execution for Technical mode is a scope call, not an SRS mandate either way.** If real code-correctness verification (actually running submitted code against test cases) turns out to be an expected feature, that's a materially larger milestone (sandboxing infra, per-language runners) that should be scoped separately rather than folded into M5's estimate.
- **Improvement-areas list is derived from lowest-scoring dimensions, not a dedicated LLM call.** This keeps `POST /complete` cheap and deterministic, but it means the "improvement areas" text is somewhat mechanical (e.g. "Complexity / Trade-off Awareness" as a label) rather than a narrative LLM-written paragraph. If product wants prose-quality improvement summaries, that's a small but real scope addition (one more LLM call at completion time).
- **`target_role` snapshotting** assumes a single primary target role can be derived from `users.career_goals` (an array, per the SRS schema). If a user has multiple simultaneous goals, which one drives question generation needs a defined precedence rule (e.g. first element, or most-recently-set) — not resolved in this guide, flagged for confirmation before `interview.service.ts` is written.
- **Interview Readiness sync assumes M2's composite-recalculation logic is exposed as a reusable function**, not only invokable from within M2's resume-upload pipeline. If M2's implementation currently computes the composite inline in its own service without a separable function, a small M2 refactor is a prerequisite for §7 step 4 rather than genuinely new M5 work.

---

## 12. What M5 does NOT include (deferred)

- Code execution / test-case verification for Technical mode — see §11
- Hard timer cutoffs / forced auto-submit at deadline — see §11
- Multiple simultaneous target roles per session — see §11
- Narrative (LLM-written) improvement-area summaries — currently mechanical, see §11
- Live proctoring, webcam, or anti-cheating measures — not mentioned anywhere in FR-6
- Job Matching (SRS §3.6 / FR references beyond FR-6) — M6
- Any Razorpay/plan-upgrade flow triggered by the M5 upgrade-CTA payload — the CTA is returned by the API, but the actual upgrade/checkout flow is M7
