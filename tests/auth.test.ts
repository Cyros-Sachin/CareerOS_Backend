import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { EmailService } from "../src/lib/email/email.service";

class MockEmailService implements EmailService {
  sentEmails: { to: string; subject: string; html: string }[] = [];

  async sendEmail(payload: { to: string; subject: string; html: string }): Promise<void> {
    this.sentEmails.push(payload);
  }

  getLastEmail() {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  clear() {
    this.sentEmails = [];
  }
}

const mockEmail = new MockEmailService();
const app = createApp(mockEmail);

let accessToken = "";
let refreshToken = "";
let verificationToken = "";
let resetOtp = "";

beforeAll(async () => {
  await pool.query("DELETE FROM password_reset_otps");
  await pool.query("DELETE FROM email_verification_tokens");
  await pool.query("DELETE FROM refresh_tokens");
  await pool.query("DELETE FROM users WHERE email LIKE 'test-%@test.com'");
});

afterAll(async () => {
  await pool.end();
});

describe("Auth — Register", () => {
  it("should register a new user", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "test-user@test.com", password: "StrongPass1", name: "Test User" });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain("Registration successful");

    const email = mockEmail.getLastEmail();
    expect(email.to).toBe("test-user@test.com");
    expect(email.subject).toContain("Verify");

    const tokenMatch = email.html.match(/token=([a-f0-9]+)/);
    if (tokenMatch) verificationToken = tokenMatch[1];
  });

  it("should return 400 for weak password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "weak@test.com", password: "weak", name: "Weak" });

    expect(res.status).toBe(400);
  });

  it("should return generic message if email already registered", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "test-user@test.com", password: "StrongPass1", name: "Test User" });

    expect(res.status).toBe(201);
    expect(res.body.message).toContain("Registration successful");
  });
});

describe("Auth — Email Verification", () => {
  it("should verify email with valid token", async () => {
    const res = await request(app).get(`/api/auth/verify-email?token=${verificationToken}`);
    expect(res.status).toBe(200);
  });

  it("should reject already used token", async () => {
    const res = await request(app).get(`/api/auth/verify-email?token=${verificationToken}`);
    expect(res.status).toBe(400);
  });
});

describe("Auth — Login", () => {
  it("should login with correct credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test-user@test.com", password: "StrongPass1" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe("test-user@test.com");

    accessToken = res.body.accessToken;
    const cookies = res.headers["set-cookie"];
    const refreshCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.startsWith("refreshToken="))
      : null;
    if (refreshCookie) {
      refreshToken = refreshCookie.split(";")[0].split("=")[1];
    }
  });

  it("should reject login for unverified email", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ email: "test-unverified@test.com", password: "StrongPass1", name: "Unverified" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test-unverified@test.com", password: "StrongPass1" });

    expect(res.status).toBe(403);
  });

  it("should reject wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test-user@test.com", password: "WrongPass1" });

    expect(res.status).toBe(401);
  });
});

describe("Auth — Account Lockout", () => {
  it("should lock account after 5 failed attempts", async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/auth/login")
        .send({ email: "test-lockout@test.com", password: "WrongPass1" });
    }

    await request(app)
      .post("/api/auth/register")
      .send({ email: "test-lockout@test.com", password: "StrongPass1", name: "Lockout" });

    const tokenEmail = mockEmail.getLastEmail();
    const tokenMatch = tokenEmail.html.match(/token=([a-f0-9]+)/);
    if (tokenMatch) await request(app).get(`/api/auth/verify-email?token=${tokenMatch[1]}`);

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/auth/login")
        .send({ email: "test-lockout@test.com", password: "WrongPass1" });
    }

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test-lockout@test.com", password: "StrongPass1" });

    expect(res.status).toBe(423);
  });
});

describe("Auth — Refresh Token Rotation", () => {
  it("should rotate refresh token on refresh", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `refreshToken=${refreshToken}`);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();

    const cookies = res.headers["set-cookie"];
    const newRefreshCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.startsWith("refreshToken="))
      : null;
    if (newRefreshCookie) {
      refreshToken = newRefreshCookie.split(";")[0].split("=")[1];
    }
    accessToken = res.body.accessToken;
  });

  it("should reject reused refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `refreshToken=${refreshToken}`);

    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"];
    const cookieArr = Array.isArray(cookies) ? cookies : cookies ? [cookies] : [];
    refreshToken = cookieArr.find((c) => c.startsWith("refreshToken="))?.split(";")[0].split("=")[1] || refreshToken;
    accessToken = res.body.accessToken;
  });
});

describe("Auth — Forgot/Reset Password", () => {
  it("should send OTP for existing email", async () => {
    mockEmail.clear();
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "test-user@test.com" });

    expect(res.status).toBe(200);

    const email = mockEmail.getLastEmail();
    expect(email).toBeDefined();
    expect(email.subject).toContain("Reset");

    const otpMatch = email.html.match(/>(\d{6})<\/div>/);
    if (otpMatch) resetOtp = otpMatch[1];
  });

  it("should reset password with valid OTP", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "test-user@test.com", otp: resetOtp, newPassword: "NewStrong1" });

    expect(res.status).toBe(200);
  });

  it("should login with new password after reset", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test-user@test.com", password: "NewStrong1" });

    expect(res.status).toBe(200);
  });

  it("should exhaust OTP after 5 wrong attempts", async () => {
    mockEmail.clear();
    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "test-user@test.com" });

    const email = mockEmail.getLastEmail();
    const otpMatch = email.html.match(/>(\d{6})<\/div>/);
    const otp = otpMatch ? otpMatch[1] : "000000";

    for (let i = 0; i < 5; i++) {
      const wrongOtp = String(Number(otp) + 1 + i).padStart(6, "0");
      await request(app)
        .post("/api/auth/reset-password")
        .send({ email: "test-user@test.com", otp: wrongOtp, newPassword: "NewStrong1" });
    }

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ email: "test-user@test.com", otp, newPassword: "NewStrong1" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OTP_EXHAUSTED");
  });
});

describe("Auth — Me", () => {
  it("should return user profile with valid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("test-user@test.com");
  });

  it("should return 401 without token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("Onboarding", () => {
  it("should get onboarding status", async () => {
    const res = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.onboarding_step).toBe(0);
  });

  it("should update step 1", async () => {
    const res = await request(app)
      .patch("/api/onboarding/step-1")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Test User", college: "IIT", degree: "B.Tech", graduationYear: 2026 });

    expect(res.status).toBe(200);
  });

  it("should update step 2", async () => {
    const res = await request(app)
      .patch("/api/onboarding/step-2")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ careerGoals: ["Become a software engineer", "Work at FAANG"] });

    expect(res.status).toBe(200);
  });

  it("should update step 3", async () => {
    const res = await request(app)
      .patch("/api/onboarding/step-3")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ workPreferences: ["Remote", "Hybrid"], targetCompanies: ["Google", "Microsoft"] });

    expect(res.status).toBe(200);
  });

  it("should update step 4", async () => {
    const res = await request(app)
      .patch("/api/onboarding/step-4")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ skillLevel: "advanced" });

    expect(res.status).toBe(200);
  });

  it("should complete onboarding", async () => {
    const res = await request(app)
      .post("/api/onboarding/complete")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ skippedResume: true });

    expect(res.status).toBe(200);
  });

  it("should show completed status", async () => {
    const res = await request(app)
      .get("/api/onboarding/status")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.onboarding_completed).toBe(true);
  });
});
