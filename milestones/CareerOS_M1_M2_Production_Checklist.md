# CareerOS Backend — M1 + M2 Production Readiness Checklist

**How to use this:** every row needs a real, observed result — not "should work."
Run the command/action, paste the actual output, then mark ✅ or ❌. If you can't
produce evidence for a row, treat it as ❌ until you can. This is intentionally
strict — the goal is to find what's broken before a real user does.

Use a fresh terminal with both `npm run dev` and `npm run worker` running, and a
Postman/Insomnia collection or `curl` for every request below.

---

## Section A — Environment & boot integrity

| # | Check | How to verify | Pass criteria |
|---|---|---|---|
| A1 | API server fails fast if any required env var is missing | Temporarily rename `.env` to `.env.bak`, run `npm run dev` | Process exits immediately with a clear error naming the missing var — does NOT start and fail later on first request |
| A2 | Worker fails fast on the same missing vars | Same test, `npm run worker` | Same — exits at boot, not on first job |
| A3 | Fresh-DB migration run is clean | `docker compose down -v` (wipes volumes) → `docker compose up -d` → `npm run migrate` | All migrations 001–009 (or current max) apply with no errors, in order, no manual SQL needed |
| A4 | No secrets committed to git | `git log -p | grep -iE "AWS_SECRET|GEMINI_API_KEY|OPENAI_API_KEY|RESEND_API_KEY"` across full history | Zero matches. If any match exists, the key must be rotated, not just removed from the current file |
| A5 | `.env` is gitignored | `git check-ignore .env` | Outputs `.env` (confirms it's ignored) |
| A6 | AWS IAM user has least-privilege only | Check attached policy in IAM console | Only `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` scoped to the one bucket ARN — not `s3:*`, not `Resource: "*"` |

---

## Section B — Auth & session (M1 re-verification)

These were built in M1 — re-verify they still work after all the M2 changes,
since shared middleware (`authenticate`, `rateLimiter`, `errorHandler`) was
touched/relied-upon by new code.

| # | Check | How to verify | Pass criteria |
|---|---|---|---|
| B1 | Register → verify → login still works | Run the full M1 flow manually once | JWT + refresh cookie returned, no regressions |
| B2 | Expired/invalid JWT rejected on a resume endpoint | Call `GET /api/resume/list` with a garbage `Authorization` header | `401`, not a 500 or crash |
| B3 | One user cannot access another user's resume | Create resume as User A, call `GET /api/resume/:id` (that id) as User B's token | `403 FORBIDDEN`, not data leakage |
| B4 | Account lockout still functions | 5 failed logins in a row | `423` returned, confirmed in M1 — re-run once to confirm no regression |
| B5 | Refresh rotation still functions | Call `/api/auth/refresh` twice with the same old token (reuse attack) | All tokens revoked, per M1 spec |

---

## Section C — Upload flow (FR-2.1 – FR-2.3)

| # | Check | How to verify | Pass criteria |
|---|---|---|---|
| C1 | Valid PDF upload succeeds | Full flow: upload-url → PUT → confirm | `202`/`200` at each step, ends in `status: scored` |
| C2 | Valid DOCX upload succeeds | **Never tested yet in this conversation** — repeat full flow with a real `.docx` file | Must reach `status: scored`. If it fails here, `docx-extractor.ts` has an untested bug class |
| C3 | Oversized file rejected (>5MB) | `POST /upload-url` with `fileSizeBytes: 6000000` | `4xx` with clear error, **before** any pre-signed URL is generated — confirm no S3 call happens (check logs) |
| C4 | Wrong mimeType rejected | `POST /upload-url` with `mimeType: "image/png"` | `4xx`, rejected at validation layer, never reaches S3 |
| C5 | Client-supplied mimeType lie doesn't bypass real-content check | Upload a `.txt` file renamed to `.pdf` with `mimeType: application/pdf` | Worker should fail this in extraction (`pdf.mjs` will throw on invalid PDF structure) → `status: failed` with a sane `failureReason`, not an unhandled crash |
| C6 | Pre-signed PUT URL actually expires | Generate an upload URL, wait 16 minutes, attempt the PUT | S3 rejects with expired-signature error — confirms the 900s expiry is real, not silently unlimited |
| C7 | Object key cannot be influenced by client input | Inspect `buildResumeKey` call sites — confirm `userId`/`resumeId` are server-generated UUIDs, never derived from request body/filename | Code review pass — filename is stored separately as `original_filename`, never used in the S3 key path |

---

## Section D — Async pipeline robustness (FR-2.4 – FR-2.5, NFR-3.5)

| # | Check | How to verify | Pass criteria |
|---|---|---|---|
| D1 | BullMQ retry count is exactly 3 with exponential backoff | Force a failure (e.g. temporarily break `GEMINI_API_KEY`), watch worker logs | Exactly 3 attempts logged, increasing delay between them, then `status: failed` — not infinite retry, not silent stop after 1 |
| D2 | Worker survives a restart mid-queue | Enqueue a job, kill the worker process (`Ctrl+C`) before it completes, restart `npm run worker` | Job is picked back up from the queue, completes — no orphaned `status: processing` forever |
| D3 | Two resumes uploaded back-to-back both process correctly | Upload resume 1, immediately upload resume 2 (different files) before resume 1 finishes | Both reach `status: scored` independently, no data cross-contamination (check `parsed_data` on each matches the correct source file) |
| D4 | Oversized page count rejected post-extraction | Upload a real 4+ page PDF | Worker extracts, counts pages, rejects with `status: failed`, `failureReason` mentions page limit — **per the guide, this must happen AFTER extraction, not estimated from file size** |
| D5 | Malformed/corrupted PDF doesn't crash the worker process | Upload a renamed non-PDF binary as `.pdf` | Job fails cleanly (`status: failed`), **worker process itself stays alive** and continues processing the next queued job |
| D6 | No raw PII in logs at info level | `npm run worker` during a real upload, grep the log output | `rawText`, `parsed_data` full contents never appear — only IDs, status, counts. Run: check terminal output literally, don't assume |

---

## Section E — AI parsing correctness (FR-2.5, provider swap verification)

| # | Check | How to verify | Pass criteria |
|---|---|---|---|
| E1 | Gemini path produces valid, schema-conforming JSON | Inspect `parsed_data` on a real scored resume via `GET /api/resume/:id` | Has `skills[]`, `projects[]`, `education[]`, `experience[]`, `certifications[]` — no missing keys, no wrong types |
| E2 | Empty/absent resume sections don't break parsing | Upload a resume with no certifications section | `certifications: []`, not `null`, not a missing key, not a crash |
| E3 | Malformed AI response triggers retry-then-fail, not silent bad data | Hard to force directly — code review: confirm `lib/ai/gemini.provider.ts` actually validates response against a Zod schema before returning, and actually retries once on failure | Code review pass, or force it by temporarily mangling the system prompt to produce broken JSON and observing the retry behavior in logs |
| E4 | Switching `AI_PROVIDER=openai` still works with zero code changes | Set `AI_PROVIDER=openai`, ensure `OPENAI_API_KEY` populated, restart worker, upload a resume | Completes successfully — proves the interface abstraction actually works, not just Gemini-specific |
| E5 | Gemini timeout handled distinctly from other failures | Temporarily set `GEMINI_TIMEOUT_MS=1` (forces timeout), upload a resume | `status: failed`, `failureReason` clearly indicates a timeout, not a generic error string |

---

## Section F — Scoring engine correctness (FR-3.1 – FR-3.9)

This is the section most likely to have **silent correctness bugs** — the
pipeline "succeeding" (status: scored) doesn't mean the math is right.

| # | Check | How to verify | Pass criteria |
|---|---|---|---|
| F1 | `dimension_scores` has all 6 keys | `GET /api/resume/:id/score` on a real resume | `quality`, `ats`, `projects`, `experience`, `interview`, `market` all present, each 0–100 |
| F2 | Weighted composite math is actually correct | Manually recompute: `0.15×quality + 0.25×ats + 0.25×projects + 0.20×experience + 0.10×interview + 0.05×market`, compare to returned `atsScore` | Must match within rounding tolerance — **if this is off, the entire scoring engine's credibility is broken** |
| F3 | `atsScore` is always 0–100, never negative or >100 | Check several test resumes, including a deliberately bad one (gibberish content) and a strong one | Clamped correctly in both directions |
| F4 | Suggestions array respects 5–10 bound | `GET /api/resume/:id` → `suggestions` | `suggestions.length >= 5 && suggestions.length <= 10`, every time, even for a near-perfect resume (padding logic must kick in) |
| F5 | Unit tests for `scoring.service.ts` actually exist and pass independently | `npm test -- scoring` (or whatever isolates that file) | Tests run with **no DB, no network** — pure function tests. If none exist, this is a real gap, not just unverified |
| F6 | Score history is append-only, never overwritten | Re-score the same resume twice (delete + re-upload, or trigger a re-score path if one exists) | Two rows in `resume_score_history`, not one updated row |
| F7 | Experience weighting (internship ×2, full-time ×3, open-source ×1) is actually applied | Use a fixture resume with one of each experience type, check the experience sub-score is plausible relative to weighting | Manual sanity check — full-time should visibly outweigh open-source in the sub-score |

---

## Section G — Scan limits & versioning (FR-2.9, multi-resume)

| # | Check | How to verify | Pass criteria |
|---|---|---|---|
| G1 | Free-tier 3/month limit actually blocks the 4th upload | As a `free` tier test user, upload 4 resumes in the same calendar month | 4th `POST /upload-url` call returns `403 SCAN_LIMIT_REACHED` — **never tested yet, must verify now** |
| G2 | Limit resets in a new calendar month | Manually insert a `resume_scans` row with `billing_cycle_month` from last month, confirm count query only looks at current month | Query correctly filters by current `billing_cycle_month`, old rows don't count |
| G3 | `student`/`pro` tiers bypass the limit | Manually set a test user's `subscription_tier = 'pro'` in DB, upload 5+ resumes | No `403`, limit check is skipped entirely for non-free tiers |
| G4 | Only one resume can be `is_active = true` per user | Activate resume A, then activate resume B | Resume A's `is_active` flips to `false` automatically — verify with a direct DB query, not just the API response |
| G5 | `PATCH /:id/activate` rejects non-scored resumes | Try activating a resume still in `status: processing` | `400 INVALID_STATUS`, confirmed in code — verify it actually fires |
| G6 | `DELETE /:id` removes both the DB row and the S3 object | Delete a resume, then check: (a) DB row gone, (b) S3 object gone via AWS console or a `HeadObjectCommand` | Both true — if S3 deletion silently fails, you'll get orphaned billed storage with no DB trace to find it later |

---

## Section H — Route & API contract integrity

| # | Check | How to verify | Pass criteria |
|---|---|---|---|
| H1 | No remaining route-ordering collisions | Manually call every literal-path endpoint (`/list`, `/history`, `/upload-url`) and confirm none get swallowed by `/:id` | All return correct handler's response, not a UUID parse error |
| H2 | Every endpoint in the M2 API contract table actually exists and responds | Hit each of the 9 documented endpoints once each | No 404s for documented routes |
| H3 | `API.md` actually reflects the current real contract | Diff `API.md` against the route file | Every route, body shape, and auth requirement matches — **this was flagged as unverified earlier, check it now** |
| H4 | Health check reports real status, not a hardcoded 200 | `GET /api/health` while Postgres is intentionally stopped (`docker stop` the postgres container briefly) | Returns `503`, not a false-positive `200` |

---

## Section I — Security spot-checks (NFR-2)

| # | Check | How to verify | Pass criteria |
|---|---|---|---|
| I1 | S3 bucket blocks public access | AWS Console → bucket → Permissions | "Block all public access" = ON |
| I2 | S3 bucket has encryption-at-rest enabled | AWS Console → bucket → Properties → Default encryption | SSE-S3 or SSE-KMS enabled — **flagged as unconfirmed in the original DoD list, check now** |
| I3 | Rate limiting on `/upload-url` actually triggers | Call `POST /upload-url` 11 times in under an hour as the same user | 11th call returns `429`, matching the `10/hour` limit set in `resume.routes.ts` |
| I4 | No stack traces leak in production-mode error responses | Set `NODE_ENV=production` locally, trigger a deliberate 500 (e.g. stop Postgres mid-request) | Response body has `{ error: { code, message } }` only — no stack trace, no raw DB error text |
| I5 | CORS policy is not overly permissive | Check S3 bucket CORS config | `AllowedOrigins` lists specific domains (localhost + real prod domain when deployed) — not `"*"` |

---

## Section J — Test suite health

| # | Check | How to verify | Pass criteria |
|---|---|---|---|
| J1 | `npm test` passes fully, zero skipped/pending | Run full suite | All green, nothing marked `.skip` or `.todo` silently |
| J2 | `tests/resume.test.ts` covers the table in the M2 guide §12 | Diff actual test names against that table | Every row has a corresponding test — DOCX extraction and the 3-day-old route-bug class of issue are common gaps |
| J3 | Tests use a mocked AI provider, not real Gemini/OpenAI calls | Check test file imports | `MockResumeParser` or equivalent — tests should never hit real external APIs (cost, flakiness, rate limits) |

---

## How to score this

- **Any ❌ in Section A, C, D, F, or I is a hard blocker** — these are correctness
  and security fundamentals. Don't move to M3 with any of these failing.
- **Section B failures mean M1 regressed** — fix before anything else, since
  everything downstream depends on auth working correctly.
- **Section G and H failures are real but lower urgency** — they're spec
  requirements you haven't verified, not necessarily broken; run them and find
  out which.
- **Section J gaps** are technical debt, not launch blockers, but the longer
  they're skipped the more this checklist has to be re-run by hand instead of
  by `npm test`.

Realistically: based on what's been exercised in this conversation, expect failures or
unknowns in C2, C3, C4, C5, D4, D5, E2–E5, F1–F7, G1–G6, H3, I2, I3, J1–J3 — none of
those have been observed working yet, only assumed correct from code review.
