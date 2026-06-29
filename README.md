# CareerOS Backend — Milestones 1 & 2

Authentication + Onboarding + Resume Engine API for CareerOS, an AI career platform for Indian college students.

## Stack

- **Node.js 20 + TypeScript** — Express, raw SQL via `pg`
- **Postgres 16** (Docker, pgvector extension)
- **Redis 7** (Docker, for rate limiting + BullMQ job queue)
- **Mailhog** (Docker, local SMTP catcher for dev)
- **BullMQ** — Resume parsing job queue (runs on same Redis)
- **AWS S3** — Pre-signed URL resume uploads
- **AI Resume Parsing** — Provider-agnostic (`AI_PROVIDER` env var), defaults to Gemini 2.5 Flash, falls back to OpenAI GPT-4o

## Quick Start

### 1. Prerequisites

- Node.js 20+
- Docker + Docker Compose

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env` if needed (defaults work for local dev with Mailhog).

### 3. Start Infrastructure

```bash
docker compose up -d
```

This starts Postgres (with pgvector), Redis, and Mailhog.

Mailhog UI: http://localhost:8025

### 4. Install Dependencies & Run Migrations

```bash
npm install
npm run migrate
```

### 5. Start Dev Server

```bash
npm run dev
```

Server runs on http://localhost:4000

### 6. Seed Data (optional)

```bash
npm run seed
```

Creates:
- `test@careeros.app` / `TestPass1` (student)
- `admin@careeros.app` / `TestPass1` (admin)

### 7. Start Worker (separate terminal)

```bash
npm run worker
```

The worker processes resume parsing jobs from the BullMQ queue. Runs independently of the API server.

### 8. Run Tests

```bash
npm test
```

## API Endpoints

### Auth (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| GET | `/api/auth/verify-email?token=` | Verify email |
| POST | `/api/auth/resend-verification` | Resend verification email |
| POST | `/api/auth/login` | Login (returns access token + httpOnly refresh cookie) |
| GET | `/api/auth/google` | Google OAuth redirect |
| GET | `/api/auth/google/callback` | Google OAuth callback |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/forgot-password` | Request password reset OTP |
| POST | `/api/auth/reset-password` | Reset password with OTP |

### Auth (JWT Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/logout` | Logout (revoke refresh token) |
| GET | `/api/auth/me` | Get current user profile |

### Onboarding (JWT Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/onboarding/status` | Get current step + saved data |
| PATCH | `/api/onboarding/step-1` | Save name/college/degree/year |
| PATCH | `/api/onboarding/step-2` | Save career goals |
| PATCH | `/api/onboarding/step-3` | Save work preferences + target companies |
| PATCH | `/api/onboarding/step-4` | Save skill level |
| POST | `/api/onboarding/complete` | Complete onboarding |

### Resume (JWT Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/resume/upload-url` | Get pre-signed S3 upload URL |
| POST | `/api/resume/:id/confirm` | Confirm upload, enqueue parsing |
| GET | `/api/resume/:id/status` | Poll processing status |
| GET | `/api/resume/:id` | Full resume detail + parsed data + score |
| GET | `/api/resume/:id/score` | Score + dimension breakdown only |
| GET | `/api/resume/history` | Score history for week-over-week graph |
| GET | `/api/resume/list` | All resume versions for current user |
| PATCH | `/api/resume/:id/activate` | Set as active resume |
| DELETE | `/api/resume/:id` | Delete resume |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | DB + Redis health check |

## Project Structure

```
src/
├── server.ts              # API entrypoint
├── worker.ts              # BullMQ worker entrypoint (separate process)
├── app.ts                 # Express app assembly
├── config/env.ts          # Zod-validated env vars
├── db/
│   ├── pool.ts            # pg Pool singleton
│   ├── migrate.ts         # Migration runner
│   └── migrations/        # SQL migration files (001-009)
├── modules/
│   ├── auth/              # Auth module
│   ├── onboarding/        # Onboarding module
│   └── resume/            # Resume module (upload, parsing, scoring)
├── jobs/                  # BullMQ queue + job processors
├── middleware/             # authenticate, errorHandler, rateLimiter, validate
├── lib/                   # jwt, password, otp, redis, logger, email, s3, ai/, text-extraction
└── types/                 # Express type augmentation
```

## Security Features

- Passwords: bcrypt cost 12, min 8 chars with uppercase + number
- JWT access tokens: 15 min expiry
- Refresh tokens: rotated on use, hashed in DB (SHA-256)
- Account lockout: 5 failed attempts → 30 min lock
- Rate limiting: Redis-backed per-endpoint limits
- Anti-enumeration: generic responses for register/forgot-password
- httpOnly refresh token cookie (not exposed to JS)
- S3 pre-signed URLs: file never passes through API server
- File validation: magic bytes checked server-side after extraction
