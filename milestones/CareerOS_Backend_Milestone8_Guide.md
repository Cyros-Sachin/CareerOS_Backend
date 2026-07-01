# CareerOS Backend — Milestone 8: B2B College Portal

**Scope:** Institution accounts, an `institution_admin` role, student↔institution auto-linking, batch (cohort) definitions, and consent-gated aggregate analytics for a college's student batch. Per SRS §1.2 (B2B College Portal as a named delivery component), §2.2 FR-1.9 (`institution_admin` role), and §2.3 (`GET /api/college/batch/:id`, "JWT + B2B Role").

**Builds directly on M1–M7.** Reuses: `authenticate` middleware, `pool.ts` query helpers, `rateLimiter` factory, `errorHandler`, `logger`, migration runner, Redis caching pattern from M6, and — this is the milestone that actually aggregates the *output* of every prior one: M1's `users.college`/`degree`/`graduation_year` (onboarding data), M2's `resumes.ats_score`/`dimension_scores`, M3's `roadmap_items.completed_at` (roadmap progress), M5's `interview_sessions.total_score`, and M6's `job_applications.status` funnel. Nothing here computes a new kind of score — it's read-aggregation over data every prior milestone already produces per-student.

**Status: PLANNED — not yet implemented.** This guide is the build spec for M8, written against the M1–M7 codebase as it actually exists today.

**Note on scope boundary:** Like M6 and M7, the SRS gives this component **no FR checklist section or flow narrative** — only the component listing in §1.2, one role mention in FR-1.9, and one endpoint row in §2.3. This guide treats those three references as the spec of record, and — because they leave open questions a real institutional-data feature can't responsibly leave unanswered (see the consent section below) — adds one deliberate, clearly-flagged extension beyond the letter of the SRS.

---

## 1. Architecture decisions (proposed)

| Concern | Decision | Why |
|---|---|---|
| Institution accounts | New `institutions` table + `users.role` (`student` \| `institution_admin`) + `users.institution_id` FK | FR-1.9 says institution admins "have separate role" — implemented as a role on the existing `users`/auth system (reusing M1's JWT/session machinery) rather than a parallel auth system, since nothing in the SRS suggests institution admins need different login mechanics, just different authorization |
| Institution provisioning | Institutions and their first `institution_admin` account are created via an **internal-only process** (seed script / internal endpoint restricted to a CareerOS superadmin), not self-serve signup | Nothing in the SRS describes a B2B sales/contract/onboarding flow, and self-serve institutional signup would need identity verification (is this person really authorized to represent this college?) that's a real product design problem on its own. This mirrors M7's decision to exclude B2B billing — institution provisioning is an operational process for now, not a public flow |
| Student↔institution linking | Auto-matched at registration by comparing the student's email domain against `institutions.domain`; unmatched students (personal Gmail, etc.) get `institution_id = NULL` | Reuses M1's registration flow with one added lookup — no new UI/flow needed for the common case of a student using their official college email |
| Batch definition | `institution_batches` (institution + degree + graduation_year + label), explicitly created by the institution admin, not auto-derived from raw `(college, degree, graduation_year)` string combinations | A batch needs to be a stable, admin-owned entity an admin can reference in `GET /api/college/batch/:id` — deriving it ad hoc from free-text combinations would make the `:id` in that route meaningless (there'd be nothing to point at until a query ran) |
| Student↔batch linking | At onboarding completion, if the student's `institution_id` is set, look for an `institution_batches` row matching `(institution_id, degree, graduation_year)`; set `batch_id` if found | Keeps the linking logic in the same place M1's onboarding already writes `degree`/`graduation_year` — no separate reconciliation step needed for students who onboard *after* their batch already exists |
| **Data-sharing consent gate** | **Added beyond the SRS, deliberately.** A new `users.institution_data_sharing_consent` boolean (default `false`, opt-in only) — a student's data (individual *or* aggregate) is only included in any institution-facing view if this is `true` | Nothing in the SRS discusses consent for sharing a student's career/resume data with a third-party institutional admin — but the SRS's own Phase 5 launch checklist requires DPDP-Act-compliant handling (§6 Phase 5, item 1), and sharing an individual's resume score, interview performance, or job-application history with their college without affirmative consent is exactly the kind of processing that framework is meant to govern. This is called out explicitly as an addition, not a silent scope change — see §5 |
| Analytics scope | **Aggregate-only by default**; a named, individual-level roster view exists but only lists consenting students | Same consent reasoning — an aggregate ("62% of this batch has an active resume") is far lower-risk than a named list ("Priya Sharma: ATS score 54"), so the roster endpoint is a separate, more sensitive capability layered on top of the aggregate one, not the default view |
| Analytics computation | Computed on-demand, Redis-cached (`college:batch:{batchId}:analytics`, 1h TTL) — not precomputed/materialized | Same reasoning as M6's on-demand match computation: underlying data (scores, roadmap progress, applications) changes continuously, and a 1h-stale dashboard is an acceptable trade-off for not maintaining a separate materialized-view refresh pipeline |
| Authorization | `institution_admin` role check **plus** `batch.institution_id = req.user.institution_id` — an admin can only query batches belonging to their own institution | Prevents one college's admin from viewing another college's cohort data by guessing/incrementing a batch ID |
| Validation | Zod, same pattern as M1–M7 | Consistency |

### Key deviations / additions beyond the original SRS

- **Consent-gating is a genuine addition, not implied by anything in the source documents.** It's included because shipping individual (or even meaningfully small-cohort aggregate) student performance data to a third party without an opt-in is a real privacy problem, not a hypothetical one — and the SRS itself references DPDP Act compliance elsewhere. If product has already resolved this differently (e.g. consent is implied by institutional enrollment, or handled entirely at a contractual level between CareerOS and the college), that supersedes this guide's default — but absent that, opt-in is the safer default to build against.
- **No self-serve institution onboarding.** As with M7's B2B-billing exclusion, a real B2B sales/contracting motion (verifying institutional identity, negotiating terms, provisioning admin accounts) is treated as an operational process outside this codebase's scope, not something this milestone builds a signup form for.
- **No retroactive backfill for pre-M8 users.** Students who registered before this milestone shipped won't have `institution_id`/`batch_id` populated just because their `users.college` free-text happens to match an institution's name — see §9.

---

## 2. Files to be created (additions to existing structure)

```
src/
├── modules/
│   └── college/
│       ├── college.routes.ts               # 6 endpoints — institution_admin-only except consent toggle
│       ├── college.controller.ts
│       ├── college.service.ts              # Batch CRUD + analytics aggregation orchestration
│       ├── college.repository.ts           # Raw SQL for institutions, institution_batches; aggregate queries joining resumes/roadmap_items/interview_sessions/job_applications
│       ├── college.validators.ts           # Zod schemas (batch create payload, consent toggle)
│       └── institution-matching.service.ts # Domain-match at registration, batch auto-link at onboarding completion
├── db/migrations/
│   ├── 027_create_institutions.sql
│   ├── 028_create_institution_batches.sql
│   └── 029_alter_users_add_institution_fields.sql
└── tests/
    ├── college.test.ts                     # Integration tests (real DB, seeded multi-institution/multi-student fixtures)
    └── institution-matching.test.ts        # Unit tests for domain-match + batch-link logic (no DB)
```

---

## 3. Database schema (migrations 027–029)

### `institutions`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK, default gen_random_uuid() | |
| name | VARCHAR(255), NOT NULL | |
| domain | VARCHAR(255), nullable, UNIQUE | Email domain for auto-matching, e.g. `cuj.ac.in`. Nullable because not every institution necessarily has one enforceable domain at onboarding time |
| contact_email | VARCHAR(255), NOT NULL | TPO or admin contact |
| created_at | TIMESTAMP, DEFAULT NOW() | |

### `institution_batches`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | This is the `:id` in `GET /api/college/batch/:id` |
| institution_id | UUID FK → institutions.id, CASCADE | |
| degree | VARCHAR(100), NOT NULL | e.g. "B.Tech" |
| graduation_year | INTEGER, NOT NULL | |
| label | VARCHAR(255), nullable | e.g. "B.Tech CSE 2024–2028", admin-facing display name |
| created_at | TIMESTAMP, DEFAULT NOW() | |

Index: `(institution_id, degree, graduation_year)` for the auto-link lookup in §5.

### `users` (altered)
| Column | Type | Notes |
|---|---|---|
| role | ENUM('student','institution_admin'), DEFAULT 'student' | |
| institution_id | UUID FK → institutions.id, nullable | Set via domain auto-match (students) or directly at provisioning (institution_admin accounts) |
| batch_id | UUID FK → institution_batches.id, nullable | Set at onboarding completion if a matching batch exists (§5) |
| institution_data_sharing_consent | BOOLEAN, DEFAULT false | Opt-in gate, see §1 |

---

## 4. API contract (proposed)

All endpoints require `Authorization: Bearer <accessToken>`. Batch-management and analytics endpoints additionally require `role = 'institution_admin'` **and** ownership of the referenced institution/batch.

| Method | Endpoint | Body / Query | Purpose |
|---|---|---|---|
| POST | `/api/college/batches` | `{ degree, graduationYear, label? }` | Institution admin creates a batch under their own institution; triggers the backfill link described in §5 |
| GET | `/api/college/batches` | — | List batches belonging to the admin's institution |
| GET | `/api/college/batch/:id` | — | Per SRS §2.3 — aggregate cohort analytics for this batch (consenting students only) |
| GET | `/api/college/batch/:id/students` | `?limit=50` | Named roster — only students in this batch with `institution_data_sharing_consent = true` |
| PATCH | `/api/college/consent` | `{ consent: boolean }` | Student-facing — toggles their own `institution_data_sharing_consent` |
| GET | `/api/college/my-institution` | — | Student-facing — read-only view of which institution/batch (if any) they're linked to, so the consent toggle has context |

### Batch analytics response shape (proposed)

```
{
  batchId, label, institutionName, degree, graduationYear,
  headcount: { totalLinked, consenting },
  onboarding: { completionRatePct },
  resume: { uploadRatePct, avgAtsScore, avgDimensionScores: {...} },
  roadmap: { avgCompletionPct },
  interviews: { sessionsCompleted, avgTotalScore },
  jobs: { applied, interview, offer, rejected },
  topMissingSkills: [ { skillName, countAffected }, ... up to 5 ]
}
```

All fields computed **only** over students with `institution_data_sharing_consent = true` in this batch; `headcount.totalLinked` (shown for transparency, e.g. "42 of 60 linked students consenting") is the only figure that reflects non-consenting students, and only as a bare count — no other data about them is included anywhere in the response.

---

## 5. Institution & batch linking (`institution-matching.service.ts`)

**At registration (extends M1):** after a new `student`-role user registers, extract the email domain and look up `institutions.domain`. On match, set `users.institution_id`. No UI change needed — this runs invisibly during the existing registration flow.

**At onboarding completion (extends M1's onboarding wizard):** once `degree` and `graduation_year` are saved (onboarding step 1), if `institution_id` is set, look up `institution_batches` for `(institution_id, degree, graduation_year)`. On match, set `batch_id`. If no matching batch exists yet (the institution admin hasn't created it), the student remains `institution_id`-linked but `batch_id = NULL` until a batch is created.

**On batch creation (`POST /college/batches`):** immediately after insert, run a one-time backfill query — `UPDATE users SET batch_id = :newBatchId WHERE institution_id = :institutionId AND degree = :degree AND graduation_year = :graduationYear AND batch_id IS NULL` — so students who registered *before* the batch existed get linked retroactively rather than being permanently missed.

---

## 6. Analytics aggregation (`college.service.ts`)

For a given batch, `GET /api/college/batch/:id` runs (all scoped to `batch_id = :id AND institution_data_sharing_consent = true`):

- **Headcount:** `COUNT(*)` linked to the batch vs. `COUNT(*) WHERE consent = true`.
- **Onboarding completion:** % with a completed onboarding record (M1).
- **Resume:** % with at least one uploaded resume; average `ats_score` and average of each `dimension_scores` key across active resumes (M2).
- **Roadmap:** average `(completed roadmap_items / total roadmap_items)` across students with an active roadmap (M3).
- **Interviews:** count of completed `interview_sessions`; average `total_score` among those who've completed at least one (M5).
- **Jobs:** count of `job_applications` grouped by `status` (M6).
- **Top missing skills:** the 5 most frequently occurring entries across the batch's individual skill-gap results (reusing M3's gap-analysis output per student, tallied rather than recomputed).

This is entirely read-aggregation — no new scoring logic is introduced in M8; every number is a `COUNT`/`AVG`/`GROUP BY` over columns prior milestones already populate.

---

## 7. Security & privacy

- Role check (`institution_admin`) and ownership check (`institution_id` match) enforced on every batch/analytics endpoint — an admin cannot view another institution's data by ID-guessing.
- Consent gate applies uniformly to both the aggregate analytics endpoint and the named roster endpoint — there is no "aggregate is fine without consent" carve-out, to keep the privacy model simple and avoid a two-tier system where "aggregate" quietly becomes identifiable at small cohort sizes (a batch of 3 consenting students' "average score" is nearly as identifying as a named list).
- `PATCH /college/consent` is fully student-controlled and reversible at any time — revoking consent immediately excludes the student from any *future* analytics query (no retroactive scrubbing of past cached/exported reports is implemented in M8; see §9).
- `institution_admin` accounts have no access to any student-facing endpoints from M1–M7 (resume upload, mentor chat, mock interviews, job matching) — the role is additive/separate, not a superset of student permissions.

---

## 8. Test coverage (planned)

### `tests/institution-matching.test.ts` (unit — no DB)
| Test | Covers |
|---|---|
| Matching email domain sets `institution_id`; non-matching (e.g. Gmail) leaves it null | §5 registration-time match |
| Onboarding completion with an existing matching batch sets `batch_id` | §5 onboarding-time match |
| Onboarding completion with no matching batch leaves `batch_id` null without erroring | §5 graceful no-match case |

### `tests/college.test.ts` (integration — real DB, seeded multi-institution fixtures)
| Test | Covers |
|---|---|
| Institution admin can create and list batches for their own institution only | §4 |
| Batch creation backfills `batch_id` for previously-registered matching students | §5 batch-creation backfill |
| `GET /batch/:id` analytics includes only consenting students' data in every computed field | §7 consent gate |
| `GET /batch/:id` `headcount.totalLinked` includes non-consenting students in the count only, no other field leaks | §7 |
| `GET /batch/:id/students` roster excludes non-consenting students entirely | §7 |
| Admin from Institution A requesting Institution B's batch → 403 | §7 ownership check |
| Student `PATCH /consent` toggling off immediately excludes them from a subsequent analytics call | §7 |
| Non-`institution_admin` role hitting any admin-only endpoint → 403 | Security |
| 401 without auth token on all endpoints | Security |

---

## 9. Known risks / open decisions before build

- **Domain-based auto-matching assumes students consistently use official college email addresses.** This is a real risk specific to the target market — many Indian college students register with personal Gmail/Outlook addresses even when an official ID exists, especially early in their program. If domain-matching turns out to link only a small fraction of a given institution's actual students, a manual linking path (e.g. an admin-driven CSV roster upload, or a student self-service "claim my institution" flow using ID verification) will likely be necessary — not built in M8, flagged here as the most likely near-term follow-up.
- **Consent rate is unknown and could make early dashboards look sparse.** Because the gate is opt-in and there's no existing product data on how many students would consent, an institution admin's first look at a freshly-onboarded batch could show a low `consenting` count relative to `totalLinked`, which may read as "the product isn't working" rather than "students haven't opted in yet." Onboarding copy that clearly explains the value exchange is a FE/product concern this guide flags but doesn't solve.
- **No retroactive backfill for users who registered before M8 shipped.** Migration 029 adds nullable columns; existing `users.college` free-text values are not run through any matching logic automatically. If backfilling the existing user base against newly-created `institutions` rows is wanted, that's a one-time data migration/admin tool, not part of this guide's ongoing linking logic.
- **Consent revocation doesn't scrub prior cached analytics responses or exports.** A revoked student is excluded from all *future* computations, but if an institution admin had already viewed or exported a report while the student was consenting, M8 doesn't attempt to claw that back — this is a reasonable industry-standard boundary (going-forward exclusion, not retroactive erasure of already-delivered reports) but should be confirmed against CareerOS's actual DPDP compliance posture rather than assumed.
- **Small-batch identifiability isn't specially handled.** Even with the "no aggregate-without-consent" rule in §7, a consenting cohort of 2–3 students still makes an "average" nearly as identifying as a named figure. A minimum-cohort-size threshold (e.g. suppress analytics below N=5 consenting students) is a common practice in similar systems but isn't built into M8; worth considering as a follow-up if small-batch institutions are expected early on.

---

## 10. What M8 does NOT include (deferred)

- Self-serve institution/admin account provisioning — internal process only, see §1
- CSV roster upload or any manual student-institution linking tool beyond domain auto-match — see §9
- Retroactive backfill of pre-M8 users against newly created institutions — see §9
- Minimum-cohort-size suppression for small batches — see §9
- Any B2B billing/contract flow for institutions — excluded consistently with M7's individual-billing-only scope
- Multi-domain institutions (e.g. separate student vs. faculty email domains) — `institutions.domain` is currently a single value
- Data export (CSV/PDF) of batch analytics — the analytics endpoint returns structured JSON only in M8
