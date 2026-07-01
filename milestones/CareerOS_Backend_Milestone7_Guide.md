# CareerOS Backend — Milestone 7: Billing & Subscription (Razorpay)

**Scope:** Razorpay checkout integration, webhook-verified payment confirmation, `subscription_tier` upgrade/downgrade, subscription expiry handling, billing/payment history, and a student-tier verification flow. Per SRS's Razorpay references in the Staging/Production/QA deployment checklists (§6, Phase 2–5) and the `subscription_tier` column already defined on `users` (§2.2).

**Builds directly on M1–M6.** Reuses: `authenticate` middleware, `pool.ts` query helpers, `rateLimiter` factory, `errorHandler`, `logger`, migration runner, BullMQ (M6's repeatable-job pattern, reused here for expiry downgrades), and — critically — this milestone is what actually **writes** `users.subscription_tier`, a column every prior milestone has only ever *read*: M2's free-tier scan limit, M4's daily mentor-message tiers, M5's Pro-only interview gating, and M6's tailoring rate limit all assumed this column would eventually be backed by a real billing flow. M7 is that flow.

**Status: PLANNED — not yet implemented.** This guide is the build spec for M7, written against the M1–M6 codebase as it actually exists today.

**Note on scope boundary:** Same situation M6 flagged — the SRS has **no dedicated FR checklist section or user-flow narrative (§3.x) for billing**, unlike auth/resume/roadmap/mentor/interviews. The only spec artifacts are: the `subscription_tier` enum on `users`, three Razorpay-credential line items across the Staging/Production checklists (§6 Phase 2 & 4), and one QA checklist line: *"Payment flow: Razorpay test checkout completes; plan upgraded in DB"* (§6 Phase 3). This guide treats those three references as the spec of record, the same way M6 treated flow §3.6 as authoritative in the absence of an FR section.

---

## 1. Architecture decisions (proposed)

| Concern | Decision | Why |
|---|---|---|
| Payment provider integration | **Razorpay Orders API** (one-time checkout per purchase), not Razorpay's Subscriptions API (recurring auto-debit / UPI Autopay mandates) | See "Key deviations" below — the QA checklist line describes a single "checkout completes" event, not a recurring mandate flow. Orders API matches what's actually specified; Subscriptions API is a materially larger scope (mandate registration, per-cycle webhook handling, UPI Autopay-specific retry/dunning logic) that isn't implied by the one line of spec that exists |
| Plan model | Fixed-duration purchases: `student_monthly`, `student_annual`, `pro_monthly`, `pro_annual` — each purchase sets `users.subscription_tier` and `users.subscription_expires_at`, no auto-renewal | Consistent with the Orders-API decision above — a purchase buys a time-boxed period, not an open-ended recurring commitment. Renewal is user-initiated (re-checkout before expiry), not automatic |
| Source of truth for tier upgrade | **Webhook-confirmed only.** `subscription_tier`/`subscription_expires_at` are written exclusively inside the Razorpay webhook handler (`payment.captured` event, signature-verified), never from the client-side "checkout succeeded" callback alone | The client-side Razorpay Checkout success callback fires in the browser and is not cryptographically trustworthy on its own — a client could construct a fake "success" call to the API without an actual captured payment. The webhook, signed with a server-only secret, is the only event that can't be spoofed from the browser. The client-side callback is still used for immediate UI feedback ("payment submitted, confirming...") but never directly grants tier access |
| Webhook idempotency | New `subscription_webhook_events` ledger table, `razorpay_event_id` UNIQUE — every incoming webhook checks this table before applying any tier change, and inserts before processing | Razorpay's webhook delivery is at-least-once (documented retry behavior on non-2xx or timeout responses) — without an idempotency check, a redelivered `payment.captured` event could double-process (harmless here since tier assignment is idempotent by value, but the ledger also gives an audit trail, which a bare "already applied" tier check wouldn't) |
| Webhook signature verification | HMAC-SHA256 of the **raw request body** against `X-Razorpay-Signature`, using a webhook-specific secret (distinct from the API key/secret pair) | This is Razorpay's documented verification method. It requires the raw body bytes, not the JSON-parsed object — the webhook route needs a raw-body-preserving middleware ahead of Express's global JSON parser, or signature verification will fail on a re-serialized (and potentially differently-formatted) body. Flagged explicitly because it's a common integration mistake, the same way M4 flagged the SSE heartbeat detail as an easy-to-miss implementation gotcha |
| Subscription expiry | BullMQ repeatable job (daily, reusing M6's cron pattern), finds `users` where `subscription_expires_at < NOW()` and `subscription_tier != 'free'`, downgrades to `free` | No auto-renewal (per the Orders-API decision) means expiry has to be actively enforced rather than relying on a failed recurring charge to signal lapse — same repeatable-job shape M6 introduced for stale-job deactivation, applied to a different table |
| Student-tier verification | College-email-domain heuristic (checkout-time input compared against a known `.ac.in`/college-domain pattern, or the `users.college` value from onboarding) sets `student_verification_status = 'pending'`; **no automated proof-of-enrollment check is built in M7** | The SRS doesn't specify how the `student` tier (distinct from `pro`) is meant to be verified — flagged explicitly in §11 as an open product decision. A heuristic pending-flag is the safe default: it doesn't block a purchase, but also doesn't silently claim a verification guarantee the system can't actually make |
| Currency & market | INR / Razorpay only — no other payment provider or currency path | Matches the SRS's explicit and sole mention of Razorpay; CareerOS's stated audience is Indian college students (§1.1) |
| Validation | Zod, same pattern as M1–M6 | Consistency |

### Key deviations from the original SRS

- **One-time checkout, not recurring subscriptions**, despite the column being named `subscription_tier`. The SRS's only behavioral spec for payments — the QA line "Razorpay test checkout completes; plan upgraded in DB" — describes a single checkout event, not a recurring debit mandate. Building true recurring billing (Razorpay Subscriptions + UPI Autopay mandate registration, per-cycle webhook handling, mandate-failure dunning) is a substantially larger integration than what's actually specified anywhere in this document. This is called out explicitly as a scope interpretation, the same way M6 called out the LinkedIn/Naukri scraping gap — if product intends true auto-renewing subscriptions, that changes this milestone's shape considerably and should be confirmed before implementation.
- **No refund/cancellation-mid-cycle flow.** Nothing in the SRS references refunds. A purchased period runs to `subscription_expires_at` regardless of later account changes; refund handling (if needed) is flagged as deferred, not silently assumed to be "not needed forever."
- **Student-tier verification is a heuristic pending-flag, not a hard gate**, for the reasons above — a user can complete a `student` checkout without CareerOS independently confirming enrollment. This mirrors real-world practice for similar low-stakes discount tiers (self-attestation), but is worth an explicit product sign-off.

---

## 2. Files to be created (additions to existing structure)

```
src/
├── lib/
│   └── payments/
│       ├── razorpay.client.ts           # Orders API wrapper (create order, fetch payment)
│       └── webhook-signature.ts         # HMAC-SHA256 raw-body verification helper
├── modules/
│   └── billing/
│       ├── billing.routes.ts            # 5 endpoints — 4 JWT-protected, webhook route is signature-gated (no JWT)
│       ├── billing.controller.ts        # Includes raw-body middleware wiring for the webhook route specifically
│       ├── billing.service.ts           # Orchestration: create order → (webhook) verify → apply tier → ledger
│       ├── billing.repository.ts        # Raw SQL for payments, subscription_webhook_events
│       ├── billing.validators.ts        # Zod schemas (plan/billingPeriod enums, student-verify payload)
│       └── expiry.worker.ts             # BullMQ repeatable job — daily downgrade sweep
├── db/migrations/
│   ├── 024_create_payments.sql
│   ├── 025_create_subscription_webhook_events.sql
│   └── 026_alter_users_add_subscription_fields.sql
└── tests/
    ├── billing.test.ts                  # Integration tests (mock Razorpay client, real DB)
    └── webhook-signature.test.ts        # Unit tests for HMAC verification (no DB, no network)
```

---

## 3. Database schema (migrations 024–026)

### `payments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK, default gen_random_uuid() | |
| user_id | UUID FK → users.id, CASCADE | |
| razorpay_order_id | VARCHAR(64), UNIQUE, NOT NULL | Set at order creation |
| razorpay_payment_id | VARCHAR(64), nullable, UNIQUE | Set only once captured (via webhook) |
| plan | ENUM('student_monthly','student_annual','pro_monthly','pro_annual'), NOT NULL | |
| amount_paise | INTEGER, NOT NULL | Razorpay amounts are integer paise, not decimal rupees |
| currency | VARCHAR(3), DEFAULT 'INR' | |
| status | ENUM('created','paid','failed'), DEFAULT 'created' | `created` at order time, `paid`/`failed` only ever set by the webhook handler |
| created_at | TIMESTAMP, DEFAULT NOW() | |
| updated_at | TIMESTAMP, DEFAULT NOW() | Bumped on status transition |

Index: `(user_id, created_at DESC)` for billing history.

### `subscription_webhook_events`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| razorpay_event_id | VARCHAR(64), UNIQUE, NOT NULL | Razorpay's own event ID — the idempotency key |
| event_type | VARCHAR(50), NOT NULL | e.g. `payment.captured`, `payment.failed` |
| payload | JSONB, NOT NULL | Full webhook body, kept for audit/debugging |
| processed_at | TIMESTAMP, DEFAULT NOW() | |

### `users` (altered)
| Column | Type | Notes |
|---|---|---|
| subscription_expires_at | TIMESTAMP, nullable | Null for `free` tier; set on successful checkout, checked by the expiry worker |
| student_verification_status | ENUM('unverified','pending','verified'), DEFAULT 'unverified' | See §1 — heuristic only in M7, not a hard enrollment check |

---

## 4. API contract (proposed)

All endpoints require `Authorization: Bearer <accessToken>` **except** the webhook route, which is instead protected by Razorpay signature verification.

| Method | Endpoint | Body / Query | Purpose |
|---|---|---|---|
| POST | `/api/billing/checkout` | `{ plan, billingPeriod }` | Creates a Razorpay Order, a `payments` row (`status='created'`), returns `{ orderId, amountPaise, currency, razorpayKeyId }` for the client to open Razorpay Checkout with |
| POST | `/api/billing/webhook` | Razorpay's raw event payload | Signature-verified (no JWT — Razorpay itself is the caller). On `payment.captured`: marks the `payments` row `paid`, sets `users.subscription_tier` + `subscription_expires_at`. On `payment.failed`: marks `payments` row `failed`, no tier change |
| GET | `/api/billing/status` | — | Current tier, expiry date, and `student_verification_status` |
| GET | `/api/billing/history` | `?limit=20` | Paginated past payments (order/payment IDs, plan, amount, status, date) |
| POST | `/api/billing/student-verify` | `{ collegeEmail }` | Sets `student_verification_status = 'pending'` if the email domain heuristically matches a college pattern; does **not** gate or unlock anything by itself — see §1 |

### Checkout + webhook flow

```
Client                  API                  Razorpay              Postgres
  │  POST /checkout        │                      │                    │
  │ ────────────────────────►│                      │                    │
  │                         │  create Order          │                    │
  │                         │ ─────────────────────►│                    │
  │                         │ ◄─────────────────────│  orderId            │
  │                         │  insert payments row    │                    │
  │                         │  (status='created')      │                    │
  │                         │ ──────────────────────────────────────────►│
  │ ◄──────────────────────── │  orderId + key           │                    │
  │                         │                      │                    │
  │  opens Razorpay          │                      │                    │
  │  Checkout widget          │                      │                    │
  │  (client-side SDK)         │                      │                    │
  │  user completes payment    │                      │                    │
  │                         │                      │                    │
  │                         │                      │  payment.captured   │
  │                         │  POST /billing/webhook│  event fires        │
  │                         │ ◄─────────────────────│                    │
  │                         │  verify HMAC signature  │                    │
  │                         │  (raw body vs. header)  │                    │
  │                         │  check event_id not       │                    │
  │                         │  already processed          │                    │
  │                         │ ──────────────────────────────────────────►│
  │                         │  mark payments 'paid',    │                    │
  │                         │  set users.subscription_  │                    │
  │                         │  tier + expires_at,        │                    │
  │                         │  insert webhook_events row  │                    │
  │                         │ ──────────────────────────────────────────►│
  │                         │  200 OK ──────────────►│                    │
```

---

## 5. Webhook handler (`billing.service.ts`, `webhook-signature.ts`)

1. Route-level raw-body middleware captures the exact bytes Razorpay sent (must run **before** any global JSON body-parser touches this specific route — a re-serialized body will fail signature verification even if the content is semantically identical).
2. Compute HMAC-SHA256 of the raw body using the webhook secret (distinct env var from the API key/secret used for order creation); compare against `X-Razorpay-Signature`. Mismatch → `400`, nothing processed.
3. Check `subscription_webhook_events.razorpay_event_id` for an existing row. If present, return `200` immediately (already processed — this is what makes redelivery safe) without re-applying any tier change.
4. Insert the event row, then branch on `event_type`:
   - `payment.captured` → update matching `payments` row (`razorpay_order_id`) to `status='paid'`, set `razorpay_payment_id`; compute `subscription_expires_at` as `NOW() + interval` (1 month or 1 year per `plan`); set `users.subscription_tier` to `student` or `pro` accordingly.
   - `payment.failed` → update `payments` row to `status='failed'`; no change to `users`.
5. Always respond `200` once processed (or already-processed) — Razorpay retries on non-2xx, so any response other than 200 after successful processing would trigger unnecessary redelivery.

---

## 6. Expiry enforcement (`expiry.worker.ts`)

- BullMQ repeatable job, daily (same `repeat: { pattern: '...' }` mechanism M6's ingestion worker uses), separate queue from ingestion.
- Query: `users` where `subscription_tier != 'free' AND subscription_expires_at < NOW()`.
- Action: set `subscription_tier = 'free'`, leave `subscription_expires_at` as-is (historical record of when the last paid period ended, not nulled out).
- No renewal reminder or dunning email is sent — CareerOS doesn't yet have a transactional-notification system built for this beyond the verification/reset emails from M1 (Resend). A pre-expiry reminder is a plausible product want but isn't built here; see §11.

---

## 7. Security

- Webhook route is **not** behind `authenticate` — it can't be, Razorpay is the caller, not a logged-in user — so signature verification is the *entire* security boundary for that route and must be correct and tested thoroughly (see §9).
- `POST /billing/checkout` rate-limited (10/hour/user) — prevents order-creation spam against the Razorpay API from a compromised or scripted client.
- `razorpay_order_id`/`razorpay_payment_id` are never accepted as client input anywhere that would let a client claim a payment succeeded — the only place `status` transitions to `paid` is inside the signature-verified webhook handler, never via any client-facing endpoint.
- Webhook secret and API key/secret are distinct credentials, both server-only env vars, never exposed to the client (the client only ever receives the public `razorpayKeyId`, which is safe to expose — it's Razorpay's own model, the key ID is meant to be public, only the key *secret* is sensitive).

---

## 8. Test coverage (planned)

### `tests/webhook-signature.test.ts` (unit — no DB, no network)
| Test | Covers |
|---|---|
| Valid signature over raw body passes verification | §5 step 2 |
| Tampered body with an otherwise-valid-looking signature fails | §5 step 2 |
| Signature computed over re-serialized JSON (not raw bytes) intentionally does NOT match — regression guard against the raw-body gotcha | §1 raw-body decision |

### `tests/billing.test.ts` (integration — mock Razorpay client, real DB)
| Test | Covers |
|---|---|
| `POST /checkout` creates an Order + `payments` row in `created` status | Core flow |
| Webhook `payment.captured` with valid signature → `payments.status='paid'`, `users.subscription_tier` updated, `subscription_expires_at` set correctly for monthly vs. annual | §5 step 4 |
| Webhook `payment.failed` → `payments.status='failed'`, no tier change | §5 step 4 |
| Redelivered webhook (same `razorpay_event_id`) → 200, no double-processing, no duplicate ledger row | §5 step 3 idempotency |
| Invalid signature → 400, no DB writes | Security |
| Expiry worker downgrades a user past `subscription_expires_at` to `free` | §6 |
| Expiry worker leaves a still-valid subscription untouched | §6 |
| `student-verify` sets `pending` status without altering `subscription_tier` | §1 heuristic-only decision |
| Billing history returns payments most-recent-first, scoped to the requesting user | Security / core flow |
| 401 without auth token on all endpoints except `/webhook` | Security |

---

## 9. Known risks / open decisions before build

- **Recurring vs. one-time billing is the single biggest open question in this milestone.** M7 as specced is one-time, fixed-duration checkout because that's the only behavior the SRS's one QA line actually describes. If product's real intent is auto-renewing subscriptions, this changes the payment-provider integration substantially (Subscriptions API, mandate registration, per-cycle webhooks) and should be confirmed before implementation starts, not discovered mid-build.
- **Student-tier verification has no defined proof-of-enrollment mechanism.** The `pending`/`verified` states exist in the schema but M7 never actually transitions anything to `verified` — that requires a defined verification method (e.g. `.ac.in` email OTP, ID upload + manual review) that isn't specified anywhere in the source documents and needs a product decision.
- **No pre-expiry reminder/renewal nudge.** A user's access silently drops to `free` when `subscription_expires_at` passes with no advance warning email. This is a plausible near-term follow-up once a broader transactional-email/notification system exists (currently CareerOS only has the verification/reset/OTP emails from M1).
- **Refunds and mid-cycle cancellation aren't covered.** If a support/refund process is needed, it's manual (direct Razorpay dashboard action) with no corresponding CareerOS-side `payments.status` or `users.subscription_tier` reconciliation built in M7.
- **B2B College Portal billing is explicitly out of scope here.** The SRS names it as a separate delivery component (§1.2) with its own persona (TPO) and analytics endpoint (`GET /api/college/batch/:id`) — nothing in the source documents describes how institutional accounts are billed, and M7 only covers the individual-user `free`/`student`/`pro` tiers.

---

## 10. What M7 does NOT include (deferred)

- True recurring/auto-debit subscriptions (Razorpay Subscriptions API, UPI Autopay mandates) — see §9
- Automated student-enrollment verification beyond a domain heuristic — see §9
- Pre-expiry renewal reminders / dunning notifications — see §9
- Refunds, proration, or mid-cycle plan changes
- B2B College Portal billing — separate component, no spec exists yet for it
- GST-compliant invoice PDF generation — `GET /billing/history` returns structured JSON, not a downloadable invoice document
