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
