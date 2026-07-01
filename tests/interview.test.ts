import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { signAccessToken } from "../src/lib/jwt";
import type { EmailService } from "../src/lib/email/email.service";

class MockEmailService implements EmailService {
  async sendEmail(): Promise<void> {}
}

vi.mock("../src/lib/ai", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    createInterviewAI: () => ({
      generateQuestions: vi.fn().mockResolvedValue({
        questions: [
          { questionOrder: 1, questionText: "Question 1: Implement a sorting algorithm" },
          { questionOrder: 2, questionText: "Question 2: Design a rate limiter" },
          { questionOrder: 3, questionText: "Question 3: Explain REST vs GraphQL" },
          { questionOrder: 4, questionText: "Question 4: Implement a binary search" },
          { questionOrder: 5, questionText: "Question 5: Design a URL shortener" },
        ],
      }),
      evaluateAnswer: vi.fn().mockResolvedValue({
        score: {
          correctness_soundness: 85,
          complexity_tradeoff_awareness: 70,
          communication_clarity: 90,
          best_practices: 75,
          completeness: 80,
        },
        feedback: "Good answer. Consider discussing edge cases and optimizing for space complexity.",
        modelAnswer: "A comprehensive solution that handles all edge cases...",
      }),
    }),
  };
});

const mockEmail = new MockEmailService();
const app = createApp(mockEmail);

let proAccessToken = "";
let freeAccessToken = "";
let proUserId = "";
let freeUserId = "";

beforeAll(async () => {
  await pool.query("DELETE FROM interview_answers");
  await pool.query("DELETE FROM interview_questions");
  await pool.query("DELETE FROM interview_sessions");
  await pool.query("DELETE FROM users WHERE email LIKE 'test-%-interview@test.com'");

  const pro = await pool.query(
    `INSERT INTO users (email, password_hash, name, email_verified, onboarding_completed, subscription_tier, career_goals, skill_level)
     VALUES ($1, $2, $3, TRUE, TRUE, 'pro', $4::text[], 'advanced')
     RETURNING id`,
    [
      "test-pro-interview@test.com",
      "$2b$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1Qlq5Gz3Y5n0qW3Z5y7Z8y9a0uS",
      "Pro User",
      ["Software Engineer"],
    ]
  );
  proUserId = pro.rows[0].id;

  const free = await pool.query(
    `INSERT INTO users (email, password_hash, name, email_verified, onboarding_completed, subscription_tier, career_goals, skill_level)
     VALUES ($1, $2, $3, TRUE, TRUE, 'free', $4::text[], 'beginner')
     RETURNING id`,
    [
      "test-free-interview@test.com",
      "$2b$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1Qlq5Gz3Y5n0qW3Z5y7Z8y9a0uS",
      "Free User",
      ["Software Engineer"],
    ]
  );
  freeUserId = free.rows[0].id;

  proAccessToken = signAccessToken({ userId: proUserId, email: "pro@test.com", role: "student" });
  freeAccessToken = signAccessToken({ userId: freeUserId, email: "free@test.com", role: "student" });
});

afterAll(async () => {
  await pool.end();
});

describe("Interview — Pro Tier Gating", () => {
  it("should return 403 with upgrade-CTA for free/student tier on POST /start", async () => {
    const res = await request(app)
      .post("/api/interview/start")
      .set("Authorization", `Bearer ${freeAccessToken}`)
      .send({ mode: "technical" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("UPGRADE_REQUIRED");
  });

  it("should return 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/interview/start")
      .send({ mode: "technical" });

    expect(res.status).toBe(401);
  });
});

describe("Interview — Session Lifecycle", () => {
  let sessionId: string;
  let questionIds: string[];

  it("should create a session with 5 questions for pro tier", async () => {
    const res = await request(app)
      .post("/api/interview/start")
      .set("Authorization", `Bearer ${proAccessToken}`)
      .send({ mode: "technical", difficulty: "medium", topic: "DSA", language: "javascript" });

    expect(res.status).toBe(201);
    expect(res.body.session).toBeDefined();
    expect(res.body.session.mode).toBe("technical");
    expect(res.body.session.status).toBe("in_progress");
    expect(res.body.questions).toHaveLength(5);
    expect(res.body.questions[0].questionText).toBeTruthy();

    sessionId = res.body.session.id;
    questionIds = res.body.questions.map((q: any) => q.id);
  });

  it("should get session detail with questions", async () => {
    const res = await request(app)
      .get(`/api/interview/${sessionId}`)
      .set("Authorization", `Bearer ${proAccessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(sessionId);
    expect(res.body.questions).toHaveLength(5);
  });

  it("should autosave answer without AI call", async () => {
    const res = await request(app)
      .patch(`/api/interview/${sessionId}/answers/${questionIds[0]}`)
      .set("Authorization", `Bearer ${proAccessToken}`)
      .send({ answerText: "function test() { return true; }" });

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
  });

  it("should return 404 for non-existent question", async () => {
    const res = await request(app)
      .patch(`/api/interview/${sessionId}/answers/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${proAccessToken}`)
      .send({ answerText: "test" });

    expect(res.status).toBe(404);
  });

  it("should return 404 for cross-user session access", async () => {
    const res = await request(app)
      .get(`/api/interview/${sessionId}`)
      .set("Authorization", `Bearer ${freeAccessToken}`);

    expect(res.status).toBe(404);
  });

  it("should return 401 on all endpoints without auth token", async () => {
    const endpoints = [
      { method: "get" as const, path: `/api/interview/${sessionId}` },
      { method: "get" as const, path: "/api/interview/history" },
    ];

    for (const ep of endpoints) {
      const res = await request(app)[ep.method](ep.path);
      expect(res.status, `${ep.method.toUpperCase()} ${ep.path} should return 401`).toBe(401);
    }
  });
});

describe("Interview — History", () => {
  it("should return sessions list most-recent-first", async () => {
    const res = await request(app)
      .get("/api/interview/history")
      .set("Authorization", `Bearer ${proAccessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 1) {
      const dates = res.body.map((s: any) => new Date(s.startedAt).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
      }
    }
  });
});

describe("Interview — Session Not Found", () => {
  it("should return 404 for non-existent session", async () => {
    const res = await request(app)
      .get("/api/interview/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${proAccessToken}`);

    expect(res.status).toBe(404);
  });
});
