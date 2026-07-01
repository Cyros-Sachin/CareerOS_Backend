# CareerOS API Reference — Frontend Integration Guide

**Base URL:** `http://localhost:4000` (dev) | `https://your-domain.com` (prod)

---

## Table of Contents

1. [Authentication Flow](#1-authentication-flow)
2. [Error Format](#2-error-format)
3. [Rate Limiting](#3-rate-limiting)
4. [Auth Endpoints](#4-auth-endpoints)
5. [Onboarding Endpoints](#5-onboarding-endpoints)
6. [Health Check](#6-health-check)
7. [Frontend Integration Guide](#7-frontend-integration-guide)
8. [Error Codes Reference](#8-error-codes-reference)
9. [Resume Engine Endpoints](#9-resume-engine-endpoints)
10. [Error Codes Reference (Additions)](#10-error-codes-reference-additions)

---

## 1. Authentication Flow

### Token Architecture

| Token | Type | Lifetime | Storage | Sent Via |
|-------|------|----------|---------|----------|
| **Access Token** | JWT | 15 minutes | Frontend memory (variable) | JSON response body |
| **Refresh Token** | Opaque (256-bit hex) | 7 days | httpOnly cookie | `Set-Cookie` header |

### Why httpOnly cookie for refresh token?

The refresh token is never exposed to JavaScript (`httpOnly`, `Secure`, `SameSite=Strict`). This prevents XSS attacks from stealing it. The cookie is scoped to `/api/auth` path — it's only sent on auth-related requests.

### Flow Diagram

```
REGISTER/LOGIN
┌──────────┐         ┌──────────────┐         ┌──────────┐
│  Frontend │  POST   │   Backend    │         │ Browser  │
│   (JS)    │ ──────► │    API       │         │ Cookies  │
│           │◄─────── │              │ ──────► │          │
│           │ JSON    │              │ Set-    │ refresh  │
│           │ {access │              │ Cookie  │ Token    │
│           │  Token, │              │         │          │
│           │  user}  │              │         │          │
└──────────┘         └──────────────┘         └──────────┘

SUBSEQUENT AUTH'D REQUESTS
┌──────────┐         ┌──────────────┐
│ Frontend │  GET    │   Backend    │
│  (JS)    │ ──────► │    API       │
│          │ Bearer  │              │
│          │ <access │              │
│          │  Token> │              │
│          │◄─────── │              │
│          │ 200/401 │              │
└──────────┘         └──────────────┘

TOKEN REFRESH (when 401 received)
┌──────────┐         ┌──────────────┐         ┌──────────┐
│ Frontend │  POST   │   Backend    │         │ Browser  │
│  (JS)    │ ──────► │    /refresh  │         │ Cookies  │
│          │◄─────── │ (reads cookie│◄────────│ sends    │
│          │ JSON    │  automagically)         │ refresh  │
│          │ {new    │              │          │ Token    │
│          │  access │              │          │          │
│          │  Token} │              │          │          │
└──────────┘         └──────────────┘         └──────────┘
```

### Refresh Token Rotation

Every time `/api/auth/refresh` is called:
1. Old refresh token is **revoked** in DB (`revoked_at` set)
2. A **new** refresh token is issued (new cookie)
3. A **new** access token is returned

If a revoked refresh token is reused (attacker stole it):
- **All** of that user's refresh tokens are revoked
- User must re-login everywhere

---

## 2. Error Format

All errors follow this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      { "path": "password", "message": "Password must be at least 8 characters" }
    ]
  }
}
```

`details` is only present for validation errors (400). Other errors omit it.

---

## 3. Rate Limiting

The API returns these headers on every response:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Max requests allowed in window |
| `X-RateLimit-Remaining` | Requests remaining in window |

When exceeded (429):

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests, please try again later"
  }
}
```

| Endpoint | Limit | Window | Keyed By |
|----------|-------|--------|----------|
| All `/api/*` | 100 | 1 min | IP |
| `POST /login` | 10 | 15 min | IP + email (both, attacker can't dodge either) |
| `POST /register` | 5 | 1 hour | IP |
| `POST /resend-verification` | 3 | 1 hour | email |
| `POST /forgot-password` | 5 | 1 hour | IP + email |
| `POST /reset-password` | 10 | 1 hour | IP |
| `POST /resume/upload-url` | 10 | 1 hour | IP |
| `POST /roadmap/generate` | 5 | 1 hour | User ID |
| `POST /roadmap/:id/regenerate` | 5 | 1 hour | User ID |

---

## 4. Auth Endpoints

---

### POST `/api/auth/register`

Create a new account. Sends verification email via Mailhog (dev) or SMTP (prod).

**Request:**
```json
{
  "email": "student@college.edu",
  "password": "StrongPass1",
  "name": "Rahul Sharma"
}
```

**Password rules:** 8+ characters, 1+ uppercase letter, 1+ number

**Success (201):**
```json
{
  "message": "Registration successful. Please check your email to verify your account."
}
```

**Anti-enumeration:** If the email is already registered, the same 201 response is returned (no error). The email is only actually sent for new registrations.

**Errors:** 400 (validation)

---

### GET `/api/auth/verify-email?token=<token>`

Verify email address using token from email link.

**Query param:** `token` — the raw hex token from the verification email

**Success (200):**
```json
{
  "message": "Email verified successfully. You can now log in."
}
```

**Errors:** 400 — `INVALID_TOKEN`, `TOKEN_USED`, `TOKEN_EXPIRED`

---

### POST `/api/auth/resend-verification`

Resend the verification email.

**Request:**
```json
{
  "email": "student@college.edu"
}
```

**Success (200):**
```json
{
  "message": "If that email exists, a verification email has been sent."
}
```

Same anti-enumeration pattern as register.

---

### POST `/api/auth/login`

Authenticate and receive tokens.

**Request:**
```json
{
  "email": "student@college.edu",
  "password": "StrongPass1"
}
```

**Success (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid-here",
    "email": "student@college.edu",
    "name": "Rahul Sharma",
    "role": "student"
  }
}
```

**Also sets cookie:** `refreshToken` (httpOnly, Secure, SameSite=Strict, path=/api/auth, 7 day expiry)

**Errors:**
| Status | Code | Meaning |
|--------|------|---------|
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 403 | `EMAIL_NOT_VERIFIED` | Email not verified yet — redirect to verify prompt |
| 423 | `ACCOUNT_LOCKED` | 5 failed attempts — 30 min lock. Message includes remaining minutes |

---

### POST `/api/auth/refresh`

Rotate tokens. Reads `refreshToken` from cookie automatically.

**No request body needed.** The cookie is sent automatically by the browser.

**Success (200):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Also sets new cookie:** rotated `refreshToken`

**Errors:**
| Status | Code | Meaning |
|--------|------|---------|
| 401 | `NO_REFRESH_TOKEN` | Cookie missing |
| 401 | `INVALID_REFRESH_TOKEN` | Token not found in DB |
| 401 | `TOKEN_EXPIRED` | Token expired (7 days) |
| 401 | `TOKEN_REUSE_DETECTED` | **Security event** — revoked token was reused. All sessions revoked. User must re-login. |

---

### POST `/api/auth/logout`

Revoke refresh token and clear cookie. Requires valid JWT.

**Headers:** `Authorization: Bearer <accessToken>`

**No request body needed.** Reads `refreshToken` from cookie.

**Success (200):**
```json
{
  "message": "Logged out successfully"
}
```

---

### GET `/api/auth/me`

Get current user's profile. Requires valid JWT.

**Headers:** `Authorization: Bearer <accessToken>`

**Success (200):**
```json
{
  "id": "uuid",
  "email": "student@college.edu",
  "name": "Rahul Sharma",
  "email_verified": true,
  "college": "IIT Bombay",
  "degree": "B.Tech",
  "graduation_year": 2026,
  "career_goals": ["Become a software engineer"],
  "work_preferences": ["Remote"],
  "target_companies": ["Google"],
  "skill_level": "advanced",
  "onboarding_step": 4,
  "onboarding_completed": true,
  "subscription_tier": "free",
  "role": "student",
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z"
}
```

---

### GET `/api/auth/google`

Redirects the browser to Google's OAuth consent screen. No body or auth required.

**Response:** 302 redirect to `https://accounts.google.com/o/oauth2/...`

---

### GET `/api/auth/google/callback?code=<code>`

Google redirects here after user consents. Backend exchanges the code for tokens.

**Query param:** `code` — authorization code from Google

**Success (200):** Same shape as login response:
```json
{
  "accessToken": "eyJ...",
  "user": { "id": "uuid", "email": "...", "name": "...", "role": "student" }
}
```

Also sets `refreshToken` cookie.

**Note:** Google-verified emails automatically have `email_verified = true`. If a user signs up with Google and already has a password account with the same email, the accounts are linked.

---

### POST `/api/auth/forgot-password`

Request a 6-digit OTP for password reset. OTP sent via email.

**Request:**
```json
{
  "email": "student@college.edu"
}
```

**Success (200):**
```json
{
  "message": "If that email exists, a password reset code has been sent."
}
```

Same anti-enumeration pattern as register. OTP expires in **10 minutes**.

---

### POST `/api/auth/reset-password`

Reset password using OTP from email.

**Request:**
```json
{
  "email": "student@college.edu",
  "otp": "483921",
  "newPassword": "NewStrong1"
}
```

**Success (200):**
```json
{
  "message": "Password reset successfully. Please log in with your new password."
}
```

**Errors:**
| Status | Code | Meaning |
|--------|------|---------|
| 400 | `INVALID_OTP` | Wrong OTP. Message includes remaining attempts (e.g., "3 attempts remaining") |
| 400 | `OTP_EXHAUSTED` | 5 wrong attempts — OTP invalidated. Request a new one |

**Important:** After a successful reset, **all existing refresh tokens are revoked**. User must log in again on all devices.

---

## 5. Onboarding Endpoints

All onboarding endpoints require `Authorization: Bearer <accessToken>`.

---

### GET `/api/onboarding/status`

Get current onboarding progress and saved data.

**Success (200):**
```json
{
  "onboarding_step": 2,
  "onboarding_completed": false,
  "name": "Rahul Sharma",
  "college": "IIT Bombay",
  "degree": "B.Tech",
  "graduation_year": 2026,
  "career_goals": ["Become a software engineer", "Work at FAANG"],
  "work_preferences": [],
  "target_companies": [],
  "skill_level": null
}
```

Use `onboarding_step` to resume the wizard at the right step (0 = start, 4 = all steps done but not completed yet).

---

### PATCH `/api/onboarding/step-1`

Save personal details.

**Request:**
```json
{
  "name": "Rahul Sharma",
  "college": "IIT Bombay",
  "degree": "B.Tech",
  "graduationYear": 2026
}
```

All fields optional — send only changed fields.

**Success (200):** `{ "message": "Step 1 saved" }`

---

### PATCH `/api/onboarding/step-2`

Save career goals.

**Request:**
```json
{
  "careerGoals": ["Become a software engineer", "Work at FAANG"]
}
```

**Success (200):** `{ "message": "Step 2 saved" }`

---

### PATCH `/api/onboarding/step-3`

Save work preferences and target companies.

**Request:**
```json
{
  "workPreferences": ["Remote", "Hybrid"],
  "targetCompanies": ["Google", "Microsoft", "Stripe"]
}
```

**Success (200):** `{ "message": "Step 3 saved" }`

---

### PATCH `/api/onboarding/step-4`

Save skill level.

**Request:**
```json
{
  "skillLevel": "advanced"
}
```

Valid values: `"beginner"`, `"mid"`, `"advanced"`

**Success (200):** `{ "message": "Step 4 saved" }`

---

### POST `/api/onboarding/complete`

Finalize onboarding. Requires `onboarding_step >= 4`.

**Request:**
```json
{
  "skippedResume": true
}
```

**Success (200):** `{ "message": "Onboarding completed!" }`

**Notes:**
- `onboarding_step` only ever **increases** — editing an earlier step won't reset progress
- `onboarding_step` tracks the furthest completed step, not the current step being edited

---

## 6. Health Check

### GET `/api/health`

Check if the API is running.

**Success (200):**
```json
{
  "status": "healthy",
  "redis": true,
  "database": true
}
```

**Degraded (200):**
```json
{
  "status": "degraded (redis down)",
  "redis": false,
  "database": true
}
```

**Unhealthy (503):**
```json
{
  "status": "unhealthy",
  "database": false
}
```

---

## 7. Frontend Integration Guide

### 7.1 API Client Setup (TypeScript)

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function apiClient<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = getAccessToken(); // from your state/store

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
    credentials: "include", // ← important: sends httpOnly cookies
  });

  // If 401, try refreshing the token
  if (res.status === 401 && !path.includes("/refresh")) {
    const refreshed = await refreshTokens();
    if (refreshed) {
      return apiClient<T>(path, options); // retry
    }
    // Refresh failed — redirect to login
    redirectToLogin();
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json();
    throw new ApiError(res.status, body.error?.code, body.error?.message, body.error?.details);
  }

  return res.json();
}
```

### 7.2 Token Refresh Implementation

```typescript
let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  // Deduplicate concurrent refresh calls
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include", // sends refreshToken cookie
      });

      if (!res.ok) return false;

      const { accessToken } = await res.json();
      setAccessToken(accessToken); // store in memory/state
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}
```

### 7.3 Login Flow (React/Next.js)

```typescript
async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json();
    switch (err.error?.code) {
      case "EMAIL_NOT_VERIFIED":
        // Show "Please verify your email" screen with resend button
        return { error: "unverified" };
      case "ACCOUNT_LOCKED":
        // Show lockout message (includes minutes remaining in err.message)
        return { error: "locked", message: err.error.message };
      case "INVALID_CREDENTIALS":
        return { error: "invalid" };
      default:
        return { error: "unknown" };
    }
  }

  const { accessToken, user } = await res.json();
  // Refresh token is automatically stored in httpOnly cookie by browser
  setAccessToken(accessToken); // store in memory
  return { user };
}
```

### 7.4 Register Flow with Verification

```typescript
async function register(email: string, password: string, name: string) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  // Always shows success (anti-enumeration)
  const { message } = await res.json();

  // Redirect to "check your email" page
  // The verification email contains a link to:
  //   <FRONTEND_URL>/verify-email?token=<hex>
  // Your frontend should parse the token and call GET /api/auth/verify-email
}
```

### 7.5 Google OAuth Flow

```typescript
// Step 1: Redirect user to Google
window.location.href = `${API_BASE}/api/auth/google`;

// Step 2: Google redirects to your callback URL
// In Next.js, this would be /api/auth/google/callback on your server
// On the backend, the callback is at GET /api/auth/google/callback?code=...

// Option A: Server-side handler
// Have your Next.js route handler proxy the code to the backend:
async function handleGoogleCallback(code: string) {
  const res = await fetch(`${API_BASE}/api/auth/google/callback?code=${code}`, {
    credentials: "include",
  });
  const { accessToken, user } = await res.json();
  setAccessToken(accessToken);
  // refreshToken is in httpOnly cookie
  return user;
}

// Option B: Direct redirect
// Configure GOOGLE_CALLBACK_URL in backend env to point to your frontend URL
// Backend redirects to FRONTEND_URL after successful auth with tokens in query
```

### 7.6 Forgot/Reset Password Flow

```typescript
// Step 1: Request OTP
await apiClient("/api/auth/forgot-password", {
  method: "POST",
  body: JSON.stringify({ email }),
});
// Always shows success — show "Check your email" page

// Step 2: User enters OTP from email + new password
try {
  await apiClient("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, otp, newPassword }),
  });
  // Show success, redirect to login
} catch (err) {
  if (err.code === "OTP_EXHAUSTED") {
    // Show "Request a new OTP" screen
  }
  // err.message includes remaining attempts on wrong OTP
}
```

### 7.7 Onboarding Wizard State Machine

```
Page Load
    │
    ▼
GET /api/onboarding/status
    │
    ├── onboarding_completed = true → Redirect to dashboard
    │
    └── onboarding_step = 0 → Step 1 (Personal Info)
    │       │
    │       ▼  PATCH /api/onboarding/step-1
    │   onboarding_step = 1
    │       │
    │       ▼  PATCH /api/onboarding/step-2
    │   onboarding_step = 2
    │       │
    │       ▼  PATCH /api/onboarding/step-3
    │   onboarding_step = 3
    │       │
    │       ▼  PATCH /api/onboarding/step-4
    │   onboarding_step = 4
    │       │
    │       ▼  POST /api/onboarding/complete
    │   onboarding_completed = true → Dashboard
    │
    └── onboarding_step = 2 → Resume at Step 3
```

**Key rules for the wizard:**
- Save each step independently as user navigates (don't batch)
- `PATCH` (not `PUT`) — send only changed fields
- `onboarding_step` never decreases — editing step 1 after completing step 3 doesn't reset progress
- The `/status` endpoint returns all saved data — pre-fill form fields even when resuming

---

## 8. Error Codes Reference

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Invalid request body (check `details` array) |
| `MISSING_TOKEN` | 400 | Verification token query param missing |
| `INVALID_TOKEN` | 400 | Verification token not found or invalid |
| `TOKEN_USED` | 400 | Verification token already consumed |
| `TOKEN_EXPIRED` | 400/401 | Token/OTP has expired |
| `INVALID_OTP` | 400 | Wrong password reset OTP |
| `OTP_EXHAUSTED` | 400 | 5 wrong OTP attempts — request new one |
| `ONBOARDING_INCOMPLETE` | 400 | Tried to complete before finishing all steps |
| `UNAUTHORIZED` | 401 | Missing/invalid Authorization header |
| `TOKEN_EXPIRED` | 401 | Access token expired |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `NO_REFRESH_TOKEN` | 401 | Refresh cookie missing |
| `INVALID_REFRESH_TOKEN` | 401 | Refresh token not found in DB |
| `TOKEN_REUSE_DETECTED` | 401 | **Security** — revoked token reused. All sessions revoked |
| `EMAIL_NOT_VERIFIED` | 403 | Login blocked — email not verified |
| `ACCOUNT_LOCKED` | 423 | 5 failed logins — 30 min lockout |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error (never leaks stack traces) |

---

## Cookie Configuration Summary

| Cookie | Name | Path | httpOnly | Secure | SameSite | Max Age |
|--------|------|------|----------|--------|----------|---------|
| Refresh Token | `refreshToken` | `/api/auth` | ✅ Yes | ✅ (prod) | `Strict` | 7 days |

**`credentials: "include"`** must be set on all frontend `fetch()` calls for cookies to be sent and received.

---

## 9. Resume Engine Endpoints

All resume endpoints require `Authorization: Bearer <accessToken>`.

### POST `/api/resume/upload-url`

Request a pre-signed URL to upload a resume directly to AWS S3.

**Request:**
```json
{
  "filename": "resume.pdf",
  "mimeType": "application/pdf",
  "fileSizeBytes": 500000
}
```

**Valid mimeTypes:** `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

**File limits:** ≤ 5MB, max 3 pages (page count checked server-side after extraction)

**Success (200):**
```json
{
  "uploadUrl": "https://s3.ap-south-1.amazonaws.com/careeros-resumes/resumes/...?X-Amz-Signature=...",
  "resumeId": "uuid",
  "fileKey": "resumes/{userId}/{resumeId}.pdf"
}
```

**Errors:**
| Status | Code | Meaning |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | Invalid mime type or file too large |
| 403 | `SCAN_LIMIT_REACHED` | Free tier monthly scan limit exceeded |
| 429 | `RATE_LIMITED` | Too many upload URL requests |

---

### POST `/api/resume/:id/confirm`

Call after the client successfully PUTs the file to S3. Flipping status to `processing` and enqueues a BullMQ parsing job.

**No request body needed.**

**Success (202):** `{ "message": "Resume upload confirmed. Parsing started." }`

---

### GET `/api/resume/:id/status`

Poll the processing status of a resume.

**Success (200):**
```json
{
  "status": "processing",
  "failureReason": null
}
```

**Status values:** `uploaded` → `processing` → `parsed` → `scored` | `failed`

---

### GET `/api/resume/:id`

Full resume detail including parsed data and score breakdown.

**Success (200):**
```json
{
  "id": "uuid",
  "originalFilename": "resume.pdf",
  "fileUrl": "https://...",
  "status": "scored",
  "failureReason": null,
  "pageCount": 2,
  "parsedData": {
    "skills": ["JavaScript", "React"],
    "projects": [],
    "education": [],
    "experience": [],
    "certifications": []
  },
  "atsScore": 72,
  "dimensionScores": {
    "quality": { "raw": 80, "weight": 0.15, "weighted": 12 },
    "ats": { "raw": 60, "weight": 0.25, "weighted": 15 },
    "projects": { "raw": 50, "weight": 0.25, "weighted": 12.5 },
    "experience": { "raw": 70, "weight": 0.20, "weighted": 14 },
    "interview": { "raw": 45, "weight": 0.10, "weighted": 4.5 },
    "market": { "raw": 65, "weight": 0.05, "weighted": 3.25 }
  },
  "suggestions": [
    "Add projects to showcase your development skills",
    "Add a GitHub link to your project"
  ],
  "isActive": false,
  "createdAt": "2026-06-28T...",
  "updatedAt": "2026-06-28T..."
}
```

---

### GET `/api/resume/:id/score`

Lighter payload — score and dimension breakdown only.

**Success (200):**
```json
{
  "atsScore": 72,
  "dimensionScores": { ... },
  "status": "scored"
}
```

---

### GET `/api/resume/history?limit=50`

Score history across all resumes — feeds the week-over-week graph.

**Success (200):**
```json
[
  {
    "resume_id": "uuid",
    "ats_score": 72,
    "dimension_scores": { ... },
    "recorded_at": "2026-06-28T..."
  }
]
```

---

### GET `/api/resume/list`

List all resume versions for the current user.

**Success (200):**
```json
[
  {
    "id": "uuid",
    "originalFilename": "resume.pdf",
    "status": "scored",
    "atsScore": 72,
    "isActive": true,
    "createdAt": "2026-06-28T...",
    "updatedAt": "2026-06-28T..."
  }
]
```

---

### PATCH `/api/resume/:id/activate`

Set this resume as the active version. Unsets the previously active resume in the same transaction.

**No request body needed.**

**Success (200):** `{ "message": "Resume activated" }`

---

### DELETE `/api/resume/:id`

Delete a resume (soft: removes DB row). Client should also remove the file from S3 if desired.

**Success (200):** `{ "message": "Resume deleted" }`

---

## 10. Error Codes Reference (Additions)

| Code | Status | Meaning |
|------|--------|---------|
| `SCAN_LIMIT_REACHED` | 403 | Free tier monthly scan limit exceeded |
| `RESUME_NOT_FOUND` | 404 | Resume ID not found |
| `INVALID_STATUS` | 400 | Resume is not in the expected state for the operation |
| `FORBIDDEN` | 403 | Attempting to access a resume owned by another user |

---

## 11. Skills Endpoints

All skills endpoints require `Authorization: Bearer <accessToken>`.

### GET `/api/skills`

Browse/search the skills taxonomy.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category (optional) |
| `search` | string | Search by name or alias (optional) |

**Success (200):**
```json
[
  {
    "id": "uuid",
    "name": "React",
    "category": "Frontend",
    "aliases": ["ReactJS", "React.js"],
    "description": null,
    "created_at": "2026-06-29T..."
  }
]
```

---

### GET `/api/skills/categories`

List all skill categories with counts.

**Success (200):**
```json
[
  { "category": "Frontend", "count": 48 },
  { "category": "Backend", "count": 47 }
]
```

---

## 12. Gap Analysis Endpoints

All gap analysis endpoints require `Authorization: Bearer <accessToken>`.

### GET `/api/gaps/:userId`

Analyze skill gaps between a user's current skills (from active resume) and target role requirements.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `targetRole` | string | **Required.** Target role name (e.g. "SDE", "Data Analyst") |

**Success (200):**
```json
{
  "currentSkills": ["JavaScript", "React", "Python"],
  "missingSkills": [
    {
      "skillId": "uuid",
      "skillName": "System Design",
      "category": "DSA & CS Fundamentals",
      "importanceWeight": 0.9,
      "minProficiency": "mid",
      "estLearningHours": 100
    }
  ],
  "matchPercent": 60
}
```

**matchPercent** = `((totalRequired - missing) / totalRequired) × 100`, rounded.

---

## 13. Roadmap Endpoints

All roadmap endpoints require `Authorization: Bearer <accessToken>`.

### POST `/api/roadmap/generate`

Generate a new month-by-month learning roadmap. Runs gap analysis, calls AI, persists, and marks any prior roadmap for that role as `superseded`.

**Rate limited:** 5/hour/user

**Request:**
```json
{
  "targetRole": "SDE",
  "hoursPerWeek": 15
}
```

**Success (201):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "target_role": "SDE",
  "hours_per_week": 15,
  "status": "active",
  "generated_from_skill_level": "mid",
  "created_at": "2026-06-29T...",
  "items": [
    {
      "id": "uuid",
      "month_number": 1,
      "topic": "Data Structures & Algorithms Deep Dive",
      "resources": [
        { "type": "course", "url": "https://...", "title": "Algorithms Course", "isAffiliate": false }
      ],
      "project_assignment": "Implement a sorting visualizer",
      "estimated_hours": 25,
      "is_complete": false,
      "completed_at": null
    }
  ],
  "gapAnalysis": {
    "matchPercent": 60,
    "missingSkills": [...]
  }
}
```

**Errors:**
| Status | Code | Meaning |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | Invalid body |
| 429 | `RATE_LIMITED` | Too many generation requests |

---

### GET `/api/roadmap/:userId`

Get the active roadmap for a user.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `targetRole` | string | Filter by target role (optional) |

**Success (200):**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "target_role": "SDE",
  "status": "active",
  "items": [...]
}
```

**Errors:**
| Status | Code | Meaning |
|--------|------|---------|
| 404 | `ROADMAP_NOT_FOUND` | No active roadmap found |

---

### GET `/api/roadmap/detail/:roadmapId`

Full roadmap detail with all items.

**Success (200):** Same shape as POST `/generate` response (without gapAnalysis).

---

### PATCH `/api/roadmap/items/:itemId/complete`

Toggle a roadmap item's completion status.

**Request:**
```json
{
  "isComplete": true
}
```

**Success (200):**
```json
{
  "id": "uuid",
  "roadmap_id": "uuid",
  "month_number": 1,
  "topic": "Data Structures & Algorithms Deep Dive",
  "is_complete": true,
  "completed_at": "2026-06-29T..."
}
```

Setting `isComplete: false` clears `completed_at`.

---

### POST `/api/roadmap/:roadmapId/regenerate`

Manually regenerate a roadmap. Same flow as generate — gap analysis → AI call → persist. Old roadmap marked `superseded`.

**Rate limited:** 5/hour/user

**Request:**
```json
{
  "hoursPerWeek": 20
}
```

`hoursPerWeek` is optional — defaults to the original value.

**Success (201):** Same shape as POST `/generate`.

---

### GET `/api/roadmap/:roadmapId/export.pdf`

**Not yet implemented.** Returns 501.

**Success (501):**
```json
{
  "error": {
    "code": "NOT_IMPLEMENTED",
    "message": "PDF export is not yet available"
  }
}
```

---

## 14. Mock Interview Endpoints

All interview endpoints require `Authorization: Bearer <accessToken>`.

### POST `/api/interview/start`

Create a new mock interview session. Generates 5 AI questions. Requires **Pro** subscription tier.

**Rate limited:** 5/hour/user

**Request:**
```json
{
  "mode": "technical",
  "difficulty": "medium",
  "topic": "DSA",
  "language": "javascript"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | enum | ✅ | `technical`, `system_design`, or `hr` |
| `difficulty` | enum | No | `easy`, `medium`, `hard` (technical only) |
| `topic` | string | No | Topic focus e.g. "DSA", "Web Dev" (technical only) |
| `language` | enum | No | `javascript`, `python`, `java`, `cpp` (technical only) |

**Success (201):**
```json
{
  "session": {
    "id": "uuid",
    "mode": "technical",
    "difficulty": "medium",
    "topic": "DSA",
    "targetRole": "Software Engineer",
    "status": "in_progress",
    "timeLimitSeconds": 2700,
    "startedAt": "2026-07-01T00:00:00.000Z"
  },
  "questions": [
    {
      "id": "uuid",
      "questionOrder": 1,
      "questionText": "Implement a function to find the longest palindrome substring...",
      "language": "javascript"
    }
  ]
}
```

**Errors:**
| Status | Code | Meaning |
|--------|------|---------|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 403 | `UPGRADE_REQUIRED` | Subscription tier is not Pro — includes upgrade-CTA payload |
| 429 | `RATE_LIMITED` | Too many session starts |

**403 Upgrade CTA payload:**
```json
{
  "error": {
    "code": "UPGRADE_REQUIRED",
    "message": "Mock interviews are available on the Pro plan",
    "details": {
      "upgradeRequired": true,
      "currentTier": "free",
      "feature": "mock_interview"
    }
  }
}
```

---

### GET `/api/interview/:sessionId`

Get session details with questions and any existing answers (for resume mid-session after page reload).

**Success (200):**
```json
{
  "session": {
    "id": "uuid",
    "mode": "technical",
    "difficulty": "medium",
    "topic": "DSA",
    "targetRole": "Software Engineer",
    "status": "in_progress",
    "timeLimitSeconds": 2700,
    "totalScore": null,
    "startedAt": "2026-07-01T00:00:00.000Z",
    "completedAt": null
  },
  "questions": [
    {
      "id": "uuid",
      "questionOrder": 1,
      "questionText": "Implement a function...",
      "language": "javascript",
      "answer": {
        "answerText": "function longestPalindrome(s) { ... }",
        "submittedAt": null,
        "submittedLate": false,
        "lastAutosavedAt": "2026-07-01T00:05:00.000Z",
        "score": null,
        "feedback": null
      }
    }
  ]
}
```

---

### PATCH `/api/interview/:sessionId/answers/:questionId`

Autosave answer text. No AI evaluation — just persists the text. Poll every 30s from the client.

**Request:**
```json
{
  "answerText": "function longestPalindrome(s) { ... }"
}
```

**Success (200):** `{ "saved": true }`

---

### POST `/api/interview/:sessionId/answers/:questionId/submit`

Submit final answer. Triggers real-time AI evaluation (5-dimension scoring). Scores are persisted but **not shown to user until the final report**.

**Request:**
```json
{
  "answerText": "function longestPalindrome(s) { ... }"
}
```

**Success (200):**
```json
{
  "submitted": true,
  "submittedLate": false,
  "score": {
    "correctness_soundness": 85,
    "complexity_tradeoff_awareness": 70,
    "communication_clarity": 90,
    "best_practices": 75,
    "completeness": 80
  },
  "feedback": "Good approach using expand-around-center. Consider discussing Manacher's algorithm for O(n) optimization. Edge case handling for empty string is well done.",
  "modelAnswer": "A strong reference answer for this question..."
}
```

---

### POST `/api/interview/:sessionId/complete`

Complete the interview session. All 5 questions must have been submitted (returns 409 otherwise). Aggregates per-answer scores into composite, writes Interview Readiness to the active resume, marks session `completed`.

**Success (200):**
```json
{
  "session": {
    "id": "uuid",
    "mode": "technical",
    "difficulty": "medium",
    "topic": "DSA",
    "targetRole": "Software Engineer",
    "status": "completed",
    "totalScore": 78,
    "timeLimitSeconds": 2700,
    "startedAt": "2026-07-01T00:00:00.000Z",
    "completedAt": "2026-07-01T00:45:00.000Z"
  },
  "averageScores": {
    "correctness_soundness": 82,
    "complexity_tradeoff_awareness": 70,
    "communication_clarity": 88,
    "best_practices": 76,
    "completeness": 78
  },
  "improvementAreas": [
    { "dimension": "complexity_tradeoff_awareness", "score": 70 },
    { "dimension": "best_practices", "score": 76 }
  ],
  "questions": [
    {
      "questionOrder": 1,
      "questionText": "Implement...",
      "language": "javascript",
      "answer": {
        "answerText": "function ...",
        "submittedAt": "2026-07-01T00:40:00.000Z",
        "submittedLate": false,
        "score": { "correctness_soundness": 85, ... },
        "feedback": "Good approach...",
        "modelAnswer": "A strong reference answer..."
      }
    }
  ]
}
```

**Errors:**
| Status | Code | Meaning |
|--------|------|---------|
| 404 | `SESSION_NOT_FOUND` | Session ID not found |
| 400 | `SESSION_NOT_ACTIVE` | Session already completed/abandoned |
| 409 | `SESSION_INCOMPLETE` | Not all questions have been answered |

---

### GET `/api/interview/:sessionId/report`

Get the full post-session report. Only available after session is completed.

**Success (200):** Same shape as POST `/complete` response.

---

### GET `/api/interview/history?limit=20`

List past interview sessions, most recent first.

**Success (200):**
```json
[
  {
    "id": "uuid",
    "mode": "technical",
    "difficulty": "medium",
    "topic": "DSA",
    "targetRole": "Software Engineer",
    "status": "completed",
    "totalScore": 78,
    "timeLimitSeconds": 2700,
    "questionCount": 5,
    "answeredCount": 5,
    "startedAt": "2026-07-01T00:00:00.000Z",
    "completedAt": "2026-07-01T00:45:00.000Z"
  }
]
```

---

### POST `/api/interview/:sessionId/abandon`

Mark an in-progress session as abandoned (does not trigger scoring or report generation).

**Success (200):** `{ "abandoned": true }`

---

## 16. Error Codes Reference (Additions)

| Code | Status | Meaning |
|------|--------|---------|
| `ROADMAP_NOT_FOUND` | 404 | No active roadmap found for user |
| `ITEM_NOT_FOUND` | 404 | Roadmap item not found |
| `MENTOR_LIMIT_REACHED` | 429 | Daily mentor chat limit reached (free=10, student=100) |
| `INVALID_GITHUB_USERNAME` | 400 | Could not extract a valid GitHub username from the URL |
| `GITHUB_USER_NOT_FOUND` | 404 | GitHub user not found |
| `GITHUB_API_ERROR` | 502 | GitHub API request failed |
| `NOT_IMPLEMENTED` | 501 | Endpoint not yet implemented |

---

## 15. Rate Limiting (Updated)

| Endpoint | Limit | Window | Keyed By |
|----------|-------|--------|----------|
| `POST /api/roadmap/generate` | 5 | 1 hour | User ID |
| `POST /api/roadmap/:roadmapId/regenerate` | 5 | 1 hour | User ID |
| `POST /api/mentor/github-audit` | 10 | 1 hour | IP |
| `POST /api/interview/start` | 5 | 1 hour | User ID |

---

## 17. Frontend Integration — Roadmap Flow

```
Client                          API                        AI Provider
  │  POST /roadmap/generate      │                           │
  │─────────────────────────────►│                           │
  │                              │  Fetch user + resume      │
  │                              │  Run gap analysis         │
  │                              │  (exact match → pgvector  │
  │                              │   → optional LLM tiebreak)│
  │                              │                           │
  │                              │  Build prompt → LLM       │
  │                              │──────────────────────────►│
  │                              │◄──────────────────────────│
  │                              │  (forced JSON roadmap)    │
  │                              │                           │
  │                              │  Mark prior superseded    │
  │                              │  Insert roadmap + items   │
  │                              │  (single transaction)     │
  │◄─────────────────────────────│ 201 { roadmap, items }    │
```

### Gap Analysis + Roadmap UI Integration

```typescript
// 1. Browse skills for onboarding autocomplete
const skills = await apiClient("/api/skills?search=React");
const categories = await apiClient("/api/skills/categories");

// 2. Check gap analysis for a target role
const gap = await apiClient(`/api/gaps/${userId}?targetRole=SDE`);
// gap.matchPercent — show as a percentage bar
// gap.missingSkills — sorted by importance

// 3. Generate roadmap
const roadmap = await apiClient("/api/roadmap/generate", {
  method: "POST",
  body: JSON.stringify({ targetRole: "SDE", hoursPerWeek: 15 }),
});

// 4. Display roadmap months
roadmap.items.forEach((item) => {
  // item.month_number — timeline
  // item.topic — learning topic
  // item.resources — links to docs/videos/courses
  // item.project_assignment — practical project
});

// 5. Toggle completion
await apiClient(`/api/roadmap/items/${itemId}/complete`, {
  method: "PATCH",
  body: JSON.stringify({ isComplete: true }),
});

// 6. Regenerate if goals/skill level change
await apiClient(`/api/roadmap/${roadmapId}/regenerate`, {
  method: "POST",
  body: JSON.stringify({ hoursPerWeek: 20 }),
});
```

---

## 18. AI Mentor Endpoints

All mentor endpoints require `Authorization: Bearer <accessToken>`.

### GET `/api/mentor/history`

Get the last N messages for the user's conversation (loaded on page open).

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | number | 50 | Number of messages to return |

**Success (200):**
```json
[
  {
    "id": "uuid",
    "role": "user",
    "content": "What skills should I learn for SDE?",
    "isCachedResponse": false,
    "createdAt": "2026-06-29T..."
  },
  {
    "id": "uuid",
    "role": "assistant",
    "content": "Based on your profile...",
    "isCachedResponse": false,
    "createdAt": "2026-06-29T..."
  }
]
```

---

### POST `/api/mentor/chat`

Send a message to the AI mentor. **Response is streamed via SSE** (Server-Sent Events).

**Request:**
```json
{
  "message": "What skills should I focus on for a backend engineering role?"
}
```

**Response:** SSE stream (`Content-Type: text/event-stream`)

```
data: {"text":"Based"}
data: {"text":" on"}
data: {"text":" your"}
data: {"text":" profile..."}
data: [DONE]
```

**Heartbeat:** A `:ping` comment is sent every 15 seconds to keep the connection alive.

**Error in stream (if rate-limited or error occurs):**
```
data: {"error":{"code":"MENTOR_LIMIT_REACHED","message":"Daily message limit (10) reached."}}
data: [DONE]
```

**Tier limits (daily, tracked in Postgres):**
| Tier | Daily Limit |
|------|-------------|
| free | 10 messages/day |
| student | 100 messages/day |
| pro | Unlimited |

Messages served from cache or blocked by the safety filter **do not count** against the daily limit.

**Caching:** Identical questions from the same user within 24 hours are served from Redis cache. Cached responses show `isCachedResponse: true` in history.

---

### GET `/api/mentor/suggested-prompts`

Returns example questions to help users get started.

**Success (200):**
```json
[
  "What skills should I focus on to become a software engineer?",
  "How can I improve my resume for FAANG companies?",
  "What projects should I build to stand out?",
  "How do I prepare for technical interviews?",
  "Should I focus on frontend or backend development?",
  "How do I choose between a startup and a big company?"
]
```

If the user has set career goals, the first two prompts are personalized.

---

### POST `/api/mentor/github-audit`

Analyze a public GitHub profile. Rate limited to 10/hour/user.

**Request:**
```json
{
  "githubUrl": "https://github.com/octocat"
}
```

**Success (200):**
```json
{
  "username": "octocat",
  "publicRepos": 8,
  "followers": 8000,
  "following": 9,
  "bio": "A robot.",
  "company": "@github",
  "location": "San Francisco",
  "blog": "https://github.blog",
  "totalStars": 250,
  "totalForks": 120,
  "languages": ["JavaScript", "Ruby", "Python"],
  "topRepos": ["Hello-World", "Spoon-Knife"],
  "profileUrl": "https://github.com/octocat",
  "auditGeneratedAt": "2026-06-29T..."
}
```

**Errors:**
| Status | Code | Meaning |
|--------|------|---------|
| 400 | `INVALID_GITHUB_USERNAME` | URL doesn't contain a valid GitHub username |
| 404 | `GITHUB_USER_NOT_FOUND` | GitHub user doesn't exist |
| 502 | `GITHUB_API_ERROR` | GitHub API request failed |

---

## 19. Frontend Integration — AI Mentor Flow

---

## 20. Frontend Integration — Mock Interview Flow

```
Client                        API                          AI Provider
  │  POST /interview/start     │                             │
  │───────────────────────────►│                             │
  │                            │  Check subscription_tier    │
  │                            │  = pro (else 403)           │
  │                            │                             │
  │                            │  Generate 5 questions        │
  │                            │  (target role + skill level   │
  │                            │  + mode/difficulty)           │
  │                            │────────────────────────────►│
  │                            │◄────────────────────────────│
  │                            │  Create session + questions  │
  │◄───────────────────────────│  201 { session, questions }  │
  │                            │                             │
  │  (30s interval)            │                             │
  │  PATCH .../answers/:qId    │  Autosave, no AI call       │
  │───────────────────────────►│                             │
  │◄───────────────────────────│  { saved: true }            │
  │                            │                             │
  │  POST .../submit           │  Check timer                │
  │───────────────────────────►│  Evaluate answer (5-dim)     │
  │                            │────────────────────────────►│
  │                            │◄────────────────────────────│
  │                            │  Persist score+feedback     │
  │◄───────────────────────────│  Score + feedback           │
  │                            │                             │
  │  (repeat for Q2-Q5)        │                             │
  │                            │                             │
  │  POST .../complete         │  Aggregate 5 scores         │
  │───────────────────────────►│  → composite total_score    │
  │                            │  Write Interview Readiness   │
  │                            │  → resumes.dimension_scores  │
  │                            │  Recompose ats_score         │
  │◄───────────────────────────│  Full report                │
```

### Mock Interview UI Integration

```typescript
// 1. Start a new interview
const { session, questions } = await apiClient("/api/interview/start", {
  method: "POST",
  body: JSON.stringify({
    mode: "technical",
    difficulty: "medium",
    topic: "DSA",
    language: "javascript",
  }),
});

// 2. Autosave every 30 seconds
const autosaveInterval = setInterval(async () => {
  await apiClient(`/api/interview/${session.id}/answers/${questionId}`, {
    method: "PATCH",
    body: JSON.stringify({ answerText: currentText }),
  });
}, 30000);

// 3. Submit an answer
const evaluation = await apiClient(
  `/api/interview/${session.id}/answers/${questionId}/submit`,
  {
    method: "POST",
    body: JSON.stringify({ answerText }),
  }
);
// Scores are persisted but not displayed to user yet

// 4. Complete session (after all 5 submitted)
const report = await apiClient(`/api/interview/${session.id}/complete`, {
  method: "POST",
});

// 5. Show report data
report.averageScores;      // 5-dimension averages
report.improvementAreas;   // Lowest-scoring dimensions
report.questions.forEach((q) => {
  q.answer.score;          // Per-question score (0-100 per dimension)
  q.answer.feedback;       // Qualitative feedback
  q.answer.modelAnswer;    // Reference answer
});

// 6. Timer enforcement
const deadline = new Date(session.startedAt).getTime()
  + session.timeLimitSeconds * 1000;

function isLate(): boolean {
  return Date.now() > deadline;
}
```

### Pro Tier Gating

```typescript
try {
  await apiClient("/api/interview/start", { method: "POST", body: {...} });
} catch (err) {
  if (err.code === "UPGRADE_REQUIRED") {
    // Show upgrade CTA with current tier info
    showUpgradeModal(err.details.currentTier);
    return;
  }
}
```

```
Client (Browser)              API                         AI Provider
  │  POST /mentor/chat         │                            │
  │───────────────────────────►│                            │
  │                            │  Rate limit check          │
  │                            │  Stage-1 safety filter      │
  │                            │  Cache check (SHA-256 hash) │
  │                            │                            │
  │                            │  [cache miss]              │
  │                            │  Fetch profile + resume     │
  │                            │  + last 10 messages         │
  │                            │                            │
  │  res.flushHeaders()        │  Stream completion          │
  │  text/event-stream         │                            │
  │◄───────────────────────────│◄───────────────────────────│
  │  data: {"text":"..."}      │  Chunk 1, 2, ...            │
  │  (repeated per chunk)      │                            │
  │                            │  On stream end:             │
  │                            │  Persist both messages      │
  │                            │  Cache response (24h TTL)   │
  │  data: [DONE]              │                            │
```

### SSE Client Implementation

```typescript
async function sendMentorMessage(message: string): Promise<void> {
  const token = getAccessToken();

  const response = await fetch(`${API_BASE}/api/mentor/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new ApiError(response.status, err.error?.code, err.error?.message);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          if (parsed.text) {
            // Append text to your UI
            appendToChat(parsed.text);
          }
          if (parsed.error) {
            // Handle error in stream
            showError(parsed.error.message);
            return;
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
  }
}
```

### Mentor UI Integration Notes

- **History on page load:** Call `GET /api/mentor/history` when the mentor page opens
- **Suggested prompts:** Call `GET /api/mentor/suggested-prompts` to populate starter buttons
- **Daily limit indicator:** Use the `X-RateLimit-Remaining` header from any response, or track via `MENTOR_LIMIT_REACHED` error
- **Cached responses:** Messages with `isCachedResponse: true` can show a "(cached)" badge in the UI
- **GitHub audit:** Use the non-streaming `POST /api/mentor/github-audit` endpoint with a dedicated button
```
