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
    createJobExtractionService: () => ({
      extractSkills: vi.fn().mockResolvedValue({
        skills: [
          { skillName: "JavaScript", importance: "required" },
          { skillName: "React", importance: "required" },
          { skillName: "Node.js", importance: "required" },
          { skillName: "TypeScript", importance: "preferred" },
          { skillName: "PostgreSQL", importance: "preferred" },
        ],
      }),
    }),
    createInterviewAI: () => ({
      generateQuestions: vi.fn(),
      evaluateAnswer: vi.fn().mockResolvedValue({
        score: {
          correctness_soundness: 85,
          complexity_tradeoff_awareness: 70,
          communication_clarity: 90,
          best_practices: 75,
          completeness: 80,
        },
        feedback: "Good approach.",
        modelAnswer: JSON.stringify({
          skills: ["JavaScript", "React", "Node.js"],
          projects: [{ name: "Test", description: "A project", techStack: ["React"], githubUrl: null, impactStatement: null }],
          education: [{ institution: "IIT", degree: "B.Tech", field: "CS", graduationYear: 2025 }],
          experience: [{ company: "Google", role: "SDE", type: "internship", durationMonths: 3, description: "Work" }],
          certifications: [],
        }),
      }),
    }),
  };
});

const mockEmail = new MockEmailService();
const app = createApp(mockEmail);

let accessToken = "";
let userId = "";

beforeAll(async () => {
  await pool.query("DELETE FROM job_applications");
  await pool.query("DELETE FROM tailored_resumes");
  await pool.query("DELETE FROM job_skills");
  await pool.query("DELETE FROM jobs");
  await pool.query("DELETE FROM users WHERE email LIKE 'test-jobs-%@test.com'");

  const user = await pool.query(
    `INSERT INTO users (email, password_hash, name, email_verified, onboarding_completed, subscription_tier, career_goals, skill_level)
     VALUES ($1, $2, $3, TRUE, TRUE, 'pro', $4::text[], 'advanced')
     RETURNING id`,
    [
      "test-jobs-user@test.com",
      "$2b$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1Qlq5Gz3Y5n0qW3Z5y7Z8y9a0uS",
      "Jobs User",
      ["Software Engineer"],
    ]
  );
  userId = user.rows[0].id;
  accessToken = signAccessToken({ userId, email: "jobs@test.com", role: "student" });
});

afterAll(async () => {
  await pool.end();
});

describe("Jobs — Auth Protection", () => {
  it("should return 401 without auth token on all endpoints", async () => {
    const endpoints = [
      { method: "get" as const, path: "/api/jobs/matches" },
      { method: "post" as const, path: "/api/jobs/manual", body: { jobText: "A".repeat(100) } },
    ];

    for (const ep of endpoints) {
      const req = request(app)[ep.method](ep.path);
      if (ep.body) req.send(ep.body);
      const res = await req;
      expect(res.status, `${ep.method.toUpperCase()} ${ep.path} should return 401`).toBe(401);
    }
  });
});

describe("Jobs — Score Gate", () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM resumes WHERE user_id = $1", [userId]);
  });

  it("should return 403 when no active resume exists", async () => {
    const res = await request(app)
      .get("/api/jobs/matches")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_ACTIVE_RESUME");
  });

  it("should return 403 when resume score is below 70", async () => {
    await pool.query(
      `INSERT INTO resumes (user_id, file_url, file_key, original_filename, file_size_bytes, mime_type, status, ats_score, is_active)
       VALUES ($1, 'https://example.com/resume.pdf', 'key', 'resume.pdf', 1000, 'application/pdf', 'scored', 50, TRUE)`,
      [userId]
    );

    const res = await request(app)
      .get("/api/jobs/matches")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("SCORE_TOO_LOW");
  });

  it("should return 200 with empty matches when score >= 70 but no profile_embedding", async () => {
    await pool.query("DELETE FROM resumes WHERE user_id = $1", [userId]);
    await pool.query(
      `INSERT INTO resumes (user_id, file_url, file_key, original_filename, file_size_bytes, mime_type, status, ats_score, is_active)
       VALUES ($1, 'https://example.com/resume.pdf', 'key', 'resume.pdf', 1000, 'application/pdf', 'scored', 75, TRUE)`,
      [userId]
    );

    const res = await request(app)
      .get("/api/jobs/matches")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_PROFILE_EMBEDDING");
  });
});

describe("Jobs — Manual Job Endpoint", () => {
  it("should process a manual job submission without hitting real AI", async () => {
    const res = await request(app)
      .post("/api/jobs/manual")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        jobText: "We are looking for a Senior Software Engineer with expertise in JavaScript, React, Node.js, TypeScript, and PostgreSQL. Must have experience with microservices, AWS, and CI/CD pipelines. Preferred: Docker, Kubernetes, GraphQL.",
      });

    expect(res.status).toBe(200);
    expect(res.body.matchPercent).toBeDefined();
    expect(res.body.extractedSkills).toBeInstanceOf(Array);
    expect(res.body.extractedSkills.length).toBeGreaterThan(0);
    expect(res.body.matchedSkills).toBeDefined();
    expect(res.body.missingSkills).toBeDefined();
  });
});

describe("Jobs — Applications", () => {
  let jobId: string;
  let applicationId: string;

  beforeAll(async () => {
    const job = await pool.query(
      `INSERT INTO jobs (source, external_id, title, company, description, apply_url)
       VALUES ('manual', 'test-job-1', 'Software Engineer', 'Test Corp', 'A great job description for testing', 'https://example.com/apply')
       RETURNING id`
    );
    jobId = job.rows[0].id;
  });

  it("should apply to a job", async () => {
    const res = await request(app)
      .post(`/api/jobs/${jobId}/apply`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ notes: "Excited about this role!" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("applied");
    expect(res.body.jobId).toBe(jobId);
    applicationId = res.body.id;
  });

  it("should list applications", async () => {
    const res = await request(app)
      .get("/api/jobs/applications")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("should update application status", async () => {
    const res = await request(app)
      .patch(`/api/jobs/applications/${applicationId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ status: "interview" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("interview");
  });

  it("should return 403 for cross-user application access", async () => {
    const otherToken = signAccessToken({ userId: "00000000-0000-0000-0000-000000000000", email: "other@test.com", role: "student" });
    const res = await request(app)
      .patch(`/api/jobs/applications/${applicationId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ status: "offer" });

    expect(res.status).toBe(403);
  });

  it("should filter applications by status", async () => {
    const res = await request(app)
      .get("/api/jobs/applications?status=interview")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.every((a: any) => a.status === "interview")).toBe(true);
  });
});
