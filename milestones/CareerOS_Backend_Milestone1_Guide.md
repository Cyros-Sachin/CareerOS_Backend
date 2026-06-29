# CareerOS Backend — Milestone 1: Auth + Onboarding

**Scope:** Registration, login, Google OAuth, email verification, JWT session management, and the 5-step onboarding flow — built on a self-hosted Docker Postgres, no Prisma, production-ready from day one.

**Actual deviations from the original plan:**
- **Email:** Switched from Nodemailer/SMTP to **Resend** (`resend.provider.ts`). The `EmailService` interface is preserved for future swaps, but the concrete implementation uses Resend's HTTP API instead of raw SMTP. Mailhog is included in `docker-compose.yml` for local dev, but the app sends via Resend regardless (configure via `RESEND_API_KEY`).
- **Refresh tokens:** **Opaque 256-bit hex tokens** stored as SHA-256 hashes in Postgres (not JWT refresh tokens). The `jwt.ts` file includes `signRefreshToken`/`verifyRefreshToken` helpers but they're **unused** — the actual rotation logic in `auth.service.ts` uses `generateRandomToken(32)` + `hashToken()`.
- **Password-reset service:** No separate `password-reset.service.ts` — the forgot/reset flow lives directly in `auth.service.ts` (`forgotPassword` / `resetPassword` methods). One less file to maintain.
- **pgvector:** Installed via `scripts/init-pgvector.sql` in the Docker entrypoint (Milestone 4 needs it for job matching). No infra changes needed later.
- **Port:** Postgres exposed on **5433** (not 5432) to avoid conflicts with a local Postgres install.
- **Tests:** Single `tests/auth.test.ts` file covers auth, password-reset, and onboarding (not three separate test files).
- **Migration 005:** Added `created_at` column to `password_reset_otps` (needed for proper `ORDER BY created_at DESC` in OTP lookup queries). The original `000_create_migrations_table.sql` file exists but is redundant — the migration runner creates `schema_migrations` itself.

---

## 1. Architecture decisions (as implemented)

| Concern | Decision | Why |
|---|---|---|
| Language | TypeScript, Node 20 LTS | Matches your existing stack |
| Framework | Express | You already know it; no need for Fastify/Nest overhead at this stage |
| DB access | Raw `pg` (node-postgres), hand-written SQL, thin repository layer | No ORM tax, full query control, no codegen binary |
| Migrations | Plain numbered `.sql` files run via custom runner with `schema_migrations` tracking | No ORM means no auto-migration tool either; runner wraps each migration in a transaction |
| DB | Postgres 16 in Docker (+ pgvector extension), port 5433 | Self-hosted, avoids local Postgres conflicts |
| Cache/rate limiting | Redis 7 (Docker) | Login rate limiting, refresh-token-adjacent lookups, future BullMQ |
| Auth tokens | JWT access (15 min) + **opaque** refresh token (7 days, rotated, SHA-256 hashed in DB) | Per SRS FR-1.4/1.5. Opaque tokens stored hashed in Postgres — a Redis flush can't break revocation |
| Password hashing | bcrypt, cost factor 12 | Industry standard, fine for self-hosted CPU budget |
| Validation | Zod | Type-safe request validation, shared types between validator and TS |
| Google OAuth | Authorization Code flow, server-side exchange via `google-auth-library` | Never expose client secret to frontend |
| Forgot password | 6-digit OTP, SHA-256 hashed, 10-min expiry, max 5 attempt count | Per SRS FR-1.6, fully wired |
| Rate limiting | Redis-backed factory `rateLimiter({ keyPrefix, windowSeconds, max, keyFn })` | Brute-force protection; each route configures its own limits |
| Email | **Resend** (`resend.provider.ts`), behind `EmailService` interface | Provider-agnostic interface preserved; Resend's HTTP API is simpler than Nodemailer SMTP |
| Logging | pino with `pino-pretty` in dev | Fast, structured, prod-grade |
| Local email dev | Mailhog (Docker) | SMTP catcher at `localhost:8025` UI — but app sends via Resend API directly |

---

## 2. Current folder structure

```
careeros-backend/
├── docker-compose.yml          # Postgres 16 (pgvector), Redis 7, Mailhog
├── .env.example
├── .env                        # (gitignored)
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── API.md                      # Frontend integration guide (795 lines)
├── src/
│   ├── server.ts               # Entrypoint: connects DB, runs migrations, starts HTTP
│   ├── app.ts                  # Express app assembly, middleware wiring
│   ├── config/
│   │   └── env.ts              # Zod-validated env vars, exits on misconfig
│   ├── db/
│   │   ├── pool.ts             # pg Pool singleton + query() / queryOne() helpers
│   │   ├── migrate.ts          # Migration runner (creates schema_migrations table)
│   │   └── migrations/
│   │       ├── 000_create_migrations_table.sql   # (redundant — runner creates it)
│   │       ├── 001_create_users.sql              # users table + trigger + enums
│   │       ├── 002_create_refresh_tokens.sql     # refresh_tokens + indexes
│   │       ├── 003_create_email_verification_tokens.sql
│   │       ├── 004_create_password_reset_otps.sql
│   │       └── 005_add_created_at_to_password_reset_otps.sql
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts        # Route definitions + per-endpoint rate limiters
│   │   │   ├── auth.controller.ts    # Request/response handling
│   │   │   ├── auth.service.ts       # Business logic (register, login, refresh, forgot/reset password, etc.)
│   │   │   ├── auth.repository.ts    # Raw SQL queries
│   │   │   ├── auth.validators.ts    # Zod schemas for all auth endpoints
│   │   │   └── google-oauth.service.ts
│   │   └── onboarding/
│   │       ├── onboarding.routes.ts
│   │       ├── onboarding.controller.ts
│   │       ├── onboarding.service.ts
│   │       ├── onboarding.repository.ts
│   │       └── onboarding.validators.ts
│   ├── middleware/
│   │   ├── authenticate.ts       # Verifies JWT Bearer token, attaches req.user
│   │   ├── errorHandler.ts       # Centralized error handler (HttpError class)
│   │   ├── rateLimiter.ts        # Redis-backed factory + generalLimiter (100/min/IP)
│   │   └── validate.ts           # Generic Zod validation middleware
│   ├── lib/
│   │   ├── jwt.ts                # signAccessToken/verifyAccessToken (+ unused refresh token helpers)
│   │   ├── password.ts           # bcrypt hash/verify wrappers
│   │   ├── otp.ts                # 6-digit OTP generation, SHA-256 hashing, random token generation
│   │   ├── redis.ts              # ioredis singleton + connectRedis/redisPing
│   │   ├── logger.ts             # pino logger
│   │   └── email/
│   │       ├── email.service.ts  # EmailService interface
│   │       ├── resend.provider.ts # Resend API implementation
│   │       └── templates/
│   │           ├── verify-email.ts    # verifyEmailTemplate() + resetPasswordTemplate()
│   │           └── reset-password.ts  # (duplicate of verify-email.ts export — consolidatable)
│   └── types/
│       └── express.d.ts          # Augments Express.Request with req.user
├── tests/
│   └── auth.test.ts              # Single integration test file (auth + onboarding)
├── scripts/
│   ├── init-pgvector.sql          # CREATE EXTENSION IF NOT EXISTS vector;
│   └── seed.ts                    # Seeds test@careeros.app + admin@careeros.app
└── dist/                         # Compiled JS output
```

---

## 3. Database schema (as implemented)

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK, default gen_random_uuid() | via pgcrypto extension |
| email | varchar(255), unique, not null | lowercased before insert (in Zod transformer) |
| password_hash | varchar(255), nullable | null if Google-only signup |
| name | varchar(255), not null | |
| google_id | varchar(255), unique, nullable | |
| email_verified | boolean, default false | |
| college | varchar(255), nullable | set in onboarding step 1 |
| degree | varchar(100), nullable | |
| graduation_year | integer, nullable | |
| career_goals | text[], default '{}' | step 2 |
| work_preferences | text[], default '{}' | step 3 |
| target_companies | text[], default '{}' | step 3 |
| skill_level | enum('beginner','mid','advanced'), nullable | step 4 |
| onboarding_step | integer, default 0 | tracks furthest completed step |
| onboarding_completed | boolean, default false | |
| subscription_tier | enum('free','student','pro'), default 'free' | |
| failed_login_attempts | integer, default 0 | |
| locked_until | timestamp, nullable | set after 5 failures |
| role | enum('student','institution_admin'), default 'student' | per SRS FR-1.9 |
| created_at | timestamp, default now() | |
| updated_at | timestamp, default now() | auto-updated via trigger `set_users_updated_at` |

### `refresh_tokens`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK, default gen_random_uuid() | |
| user_id | uuid FK → users.id, cascade delete | |
| token_hash | varchar(255), not null | SHA-256 of the raw 256-bit token |
| expires_at | timestamp, not null | 7 days |
| revoked_at | timestamp, nullable | set on rotation/logout/compromise |
| created_at | timestamp, default now() | |

Indexes on `(user_id)` and `(token_hash)`.

### `email_verification_tokens`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK, default gen_random_uuid() | |
| user_id | uuid FK → users.id, cascade delete | |
| token_hash | varchar(255) | SHA-256 of raw 32-byte hex token |
| expires_at | timestamp | 24h |
| used_at | timestamp, nullable | |

Index on `(user_id)`.

### `password_reset_otps`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK, default gen_random_uuid() | |
| user_id | uuid FK → users.id, cascade delete | |
| otp_hash | varchar(255) | SHA-256 of 6-digit numeric OTP |
| expires_at | timestamp | 10 min |
| used_at | timestamp, nullable | set on use or invalidation |
| attempt_count | integer, default 0 | cap at 5, then mark used_at |
| created_at | timestamp, default now() | added via migration 005 for correct ordering |

Index on `(user_id)`.

Forgot-password is fully implemented — real OTP flow, not a stub.

---

## 4. API contract (as implemented)

### Auth
| Method | Endpoint | Body | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | `{ email, password, name }` | Public, rate-limited (5/hr/IP) |
| GET | `/api/auth/verify-email?token=` | — | Public |
| POST | `/api/auth/resend-verification` | `{ email }` | Public, rate-limited (3/hr/email) |
| POST | `/api/auth/login` | `{ email, password }` | Public, rate-limited (10/15min/IP+email) |
| GET | `/api/auth/google` | — | Public, redirects to Google |
| GET | `/api/auth/google/callback` | `?code=` | Public, Google redirects here |
| POST | `/api/auth/refresh` | (reads httpOnly cookie) | Public (cookie required) |
| POST | `/api/auth/logout` | (reads httpOnly cookie) | JWT required |
| GET | `/api/auth/me` | — | JWT required |
| POST | `/api/auth/forgot-password` | `{ email }` | Public, rate-limited (5/hr/IP+email), anti-enumeration |
| POST | `/api/auth/reset-password` | `{ email, otp, newPassword }` | Public, rate-limited (10/hr/IP) |

### Onboarding (all JWT required via `authenticate` middleware)
| Method | Endpoint | Body |
|---|---|---|
| GET | `/api/onboarding/status` | — |
| PATCH | `/api/onboarding/step-1` | `{ name?, college?, degree?, graduationYear? }` |
| PATCH | `/api/onboarding/step-2` | `{ careerGoals: string[] }` |
| PATCH | `/api/onboarding/step-3` | `{ workPreferences: string[], targetCompanies: string[] }` |
| PATCH | `/api/onboarding/step-4` | `{ skillLevel: 'beginner'\|'mid'\|'advanced' }` |
| POST | `/api/onboarding/complete` | `{ skippedResume: boolean }` |

### Health
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Returns DB + Redis status (200 healthy, 503 down) |

### Token delivery
- **Access token:** returned in JSON body (`{ accessToken, user }`), frontend holds in memory.
- **Refresh token:** set as **`httpOnly`, `Secure` (prod), `SameSite=Strict` cookie** named `refreshToken`, scoped to `path=/api/auth`, 7-day expiry. Never exposed to JavaScript.
- **Refresh rotation:** every `/refresh` call revokes the old token (sets `revoked_at`) and issues a new one. If a revoked token is reused, **all** of that user's active refresh tokens are revoked (compromise signal).

---

## 5. Security features implemented

- **Account lockout** (SRS FR-1.7): 5 failed attempts → 30 min lock. Tracked via `failed_login_attempts` + `locked_until` on the user row in Postgres (survives restarts).
- **Refresh rotation** (FR-1.5): every `/refresh` call issues a new refresh token and revokes the old one. Reuse of a revoked token triggers **full revocation** of all active refresh tokens for that user.
- **Rate limiting** (Redis-backed, all implemented):
  | Endpoint | Limit | Window | Key |
  |---|---|---|---|
  | All `/api/*` | 100 | 1 min | IP |
  | `POST /login` | 10 | 15 min | IP + email (both checked) |
  | `POST /register` | 5 | 1 hour | IP |
  | `POST /resend-verification` | 3 | 1 hour | email |
  | `POST /forgot-password` | 5 | 1 hour | IP + email |
  | `POST /reset-password` | 10 | 1 hour | IP |
- **Email enumeration prevention**: register, resend-verification, and forgot-password all return the same generic success response whether or not the email exists. No error reveals account existence.
- **Password policy**: 8+ chars, 1 uppercase letter, 1 number — enforced in Zod schema server-side.
- **bcrypt cost 12**: computationally expensive hashing.
- **No stack trace leakage**: `errorHandler` middleware returns structured `{ error: { code, message } }` — never raw DB errors or stack traces in production.
- **Validation details**: Zod errors include `details` array with `path` + `message` for each invalid field.

---

## 6. Infrastructure (Docker Compose)

| Service | Image | Port | Notes |
|---|---|---|---|
| postgres | `pgvector/pgvector:pg16` | **5433:5432** | pgvector pre-installed, health check, named volume |
| redis | `redis:7-alpine` | 6379:6379 | Named volume, health check |
| mailhog | `mailhog/mailhog` | 1025 (SMTP) + 8025 (UI) | Dev SMTP catcher UI at `http://localhost:8025` |

**Init:** `scripts/init-pgvector.sql` runs `CREATE EXTENSION IF NOT EXISTS vector;` on first startup.

---

## 7. Quick start (as implemented)

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
npm install

# 3. Run migrations
npm run migrate

# 4. (Optional) Seed test users
npm run seed          # Creates test@careeros.app / TestPass1 and admin@careeros.app / TestPass1

# 5. Start dev server
npm run dev           # Server on http://localhost:4000

# 6. Run tests
npm test              # Vitest integration tests
```

---

## 8. Test coverage

Single file `tests/auth.test.ts` covering these scenarios:

| Scenario | Covering |
|---|---|
| Register + extract verification token from email | Auth — Register |
| Weak password rejection | Auth — Register |
| Anti-enumeration for existing email | Auth — Register |
| Email verification with valid token | Auth — Email Verification |
| Reject already-used token | Auth — Email Verification |
| Login with correct credentials + extract refresh cookie | Auth — Login |
| Reject login for unverified email (403) | Auth — Login |
| Reject wrong password (401) | Auth — Login |
| Account lockout after 5 failed attempts (423) | Auth — Account Lockout |
| Refresh token rotation | Auth — Refresh Token Rotation |
| Forgot-password sends OTP email | Auth — Forgot/Reset Password |
| Reset password with valid OTP | Auth — Forgot/Reset Password |
| Login with new password after reset | Auth — Forgot/Reset Password |
| OTP exhaustion after 5 wrong attempts | Auth — Forgot/Reset Password |
| GET /me with valid token | Auth — Me |
| GET /me without token (401) | Auth — Me |
| Onboarding status (step 0 initially) | Onboarding |
| Onboarding step-1 PATCH | Onboarding |
| Onboarding step-2 PATCH | Onboarding |
| Onboarding step-3 PATCH | Onboarding |
| Onboarding step-4 PATCH | Onboarding |
| Onboarding complete | Onboarding |
| Onboarding shows completed=true | Onboarding |

Tests use a `MockEmailService` so no real emails are sent. DB is cleaned before tests via `DELETE FROM` queries.

---

## 9. Known tech debt / consolidation opportunities

- **Migration 000:** `000_create_migrations_table.sql` is redundant — the migration runner in `migrate.ts` already creates `schema_migrations` programmatically.
- **Duplicate template export:** Both `verify-email.ts` and `reset-password.ts` export `resetPasswordTemplate`. The `reset-password.ts` file is the duplicate and can be removed.
- **Unused JWT refresh helpers:** `jwt.ts` exports `signRefreshToken` and `verifyRefreshToken` but they're never called. The app uses opaque tokens instead.
- **Template location:** Both email templates live in `verify-email.ts` (with `resetPasswordTemplate` re-exported from `reset-password.ts`). Could consolidate into single `templates.ts`.
- **Rate limiter Redis fallback:** If Redis is down, rate limiter silently passes all requests through (`next()`). Acceptable for dev; for prod, consider failing closed.
- **Forgot-password for unverified emails:** The flow works regardless of `email_verified` status. Consider whether unverified users should be able to reset passwords (current behavior allows it, which is fine since they control the email inbox).
