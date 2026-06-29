import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { runMigrations } from "../src/db/migrate";
import { EmailService } from "../src/lib/email/email.service";
import { computeAtsScore } from "../src/modules/resume/scoring.service";
import type { ParsedResumeData } from "../src/lib/ai/resume-parser.interface";

class MockEmailService implements EmailService {
  async sendEmail(): Promise<void> {
    // no-op
  }
}

vi.mock("../src/lib/ai", () => ({
  resumeParser: {
    parseResume: vi.fn().mockRejectedValue(new Error("AI not configured in tests")),
  },
}));

vi.mock("../src/lib/s3", () => ({
  s3Client: {},
  getUploadUrl: vi.fn().mockResolvedValue("https://mock-s3.example.com/upload-url"),
  getDownloadUrl: vi.fn().mockResolvedValue("https://mock-s3.example.com/download-url"),
  getObjectBuffer: vi.fn(),
  deleteObject: vi.fn(),
  buildResumeKey: (userId: string, resumeId: string, ext: string) => `resumes/${userId}/${resumeId}.${ext}`,
  getFileExtension: (mimeType: string) => mimeType === "application/pdf" ? "pdf" : "docx",
}));

const mockEmail = new MockEmailService();
const app = createApp(mockEmail);

let authToken = "";

const validPdfMime = "application/pdf";
const validDocxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

beforeAll(async () => {
  await pool.query("DELETE FROM resume_scans");
  await pool.query("DELETE FROM resume_score_history");
  await pool.query("DELETE FROM resumes");
  await pool.query("DELETE FROM users WHERE email LIKE 'resume-test-%@test.com'");

  await request(app)
    .post("/api/auth/register")
    .send({ email: "resume-test-user@test.com", password: "StrongPass1", name: "Resume Test" });

  const verifyRes = await request(app)
    .get("/api/auth/verify-email")
    .query({
      token: "0000000000000000000000000000000000000000000000000000000000000000",
    });
  if (verifyRes.status !== 200) {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "resume-test-user@test.com", password: "StrongPass1" });
    authToken = loginRes.body.accessToken;
  } else {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "resume-test-user@test.com", password: "StrongPass1" });
    authToken = loginRes.body.accessToken;
  }
});

afterAll(async () => {
  await pool.end();
});

describe("Resume — Upload URL", () => {
  it("should request upload URL for valid PDF", async () => {
    const res = await request(app)
      .post("/api/resume/upload-url")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        filename: "resume.pdf",
        mimeType: validPdfMime,
        fileSizeBytes: 500000,
      });

    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBeDefined();
    expect(res.body.resumeId).toBeDefined();
    expect(res.body.fileKey).toContain("resumes/");
  });

  it("should request upload URL for valid DOCX", async () => {
    const res = await request(app)
      .post("/api/resume/upload-url")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        filename: "resume.docx",
        mimeType: validDocxMime,
        fileSizeBytes: 300000,
      });

    expect(res.status).toBe(200);
    expect(res.body.uploadUrl).toBeDefined();
  });

  it("should reject unsupported mime type", async () => {
    const res = await request(app)
      .post("/api/resume/upload-url")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        filename: "resume.png",
        mimeType: "image/png",
        fileSizeBytes: 500000,
      });

    expect(res.status).toBe(400);
  });

  it("should reject file exceeding max size", async () => {
    const res = await request(app)
      .post("/api/resume/upload-url")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        filename: "large.pdf",
        mimeType: validPdfMime,
        fileSizeBytes: 10 * 1024 * 1024,
      });

    expect(res.status).toBe(400);
  });

  it("should return 401 without auth token", async () => {
    const res = await request(app)
      .post("/api/resume/upload-url")
      .send({
        filename: "resume.pdf",
        mimeType: validPdfMime,
        fileSizeBytes: 500000,
      });

    expect(res.status).toBe(401);
  });
});

describe("Resume — CRUD operations", () => {
  let resumeId = "";

  it("should confirm upload and return 202", async () => {
    const uploadRes = await request(app)
      .post("/api/resume/upload-url")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        filename: "to-confirm.pdf",
        mimeType: validPdfMime,
        fileSizeBytes: 400000,
      });

    resumeId = uploadRes.body.resumeId;

    const res = await request(app)
      .post(`/api/resume/${resumeId}/confirm`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(202);
  });

  it("should get resume status", async () => {
    const res = await request(app)
      .get(`/api/resume/${resumeId}/status`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });

  it("should list all resumes for user", async () => {
    const res = await request(app)
      .get("/api/resume/list")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("should get resume detail", async () => {
    const res = await request(app)
      .get(`/api/resume/${resumeId}`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(resumeId);
  });

  it("should delete resume", async () => {
    const uploadRes = await request(app)
      .post("/api/resume/upload-url")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        filename: "to-delete.pdf",
        mimeType: validPdfMime,
        fileSizeBytes: 100000,
      });

    const res = await request(app)
      .delete(`/api/resume/${uploadRes.body.resumeId}`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });
});

describe("Scoring Service — Unit Tests", () => {
  const sampleParsedData: ParsedResumeData = {
    skills: ["JavaScript", "TypeScript", "React", "Node.js", "Python", "Docker"],
    projects: [
      {
        name: "E-commerce Platform",
        description: "Built a full-stack e-commerce platform with payment integration",
        techStack: ["React", "Node.js", "PostgreSQL", "Stripe"],
        githubUrl: "https://github.com/user/ecommerce",
        impactStatement: "Handled 10k+ daily transactions",
      },
    ],
    education: [
      {
        institution: "IIT Bombay",
        degree: "B.Tech",
        field: "Computer Science",
        graduationYear: 2025,
      },
    ],
    experience: [
      {
        company: "Google",
        role: "SDE Intern",
        type: "internship",
        durationMonths: 3,
        description: "Worked on Google Cloud Platform team",
      },
    ],
    certifications: ["AWS Certified Developer"],
  };

  it("should compute ATS score within 0-100 range", () => {
    const result = computeAtsScore(sampleParsedData, ["JavaScript", "React", "Node.js", "Python", "Docker"]);
    expect(result.atsScore).toBeGreaterThanOrEqual(0);
    expect(result.atsScore).toBeLessThanOrEqual(100);
  });

  it("should return all 6 dimension scores", () => {
    const result = computeAtsScore(sampleParsedData, ["JavaScript"]);
    const dimensions = ["quality", "ats", "projects", "experience", "interview", "market"];
    for (const dim of dimensions) {
      expect(result.dimensionScores[dim]).toBeDefined();
      expect(result.dimensionScores[dim].raw).toBeGreaterThanOrEqual(0);
      expect(result.dimensionScores[dim].raw).toBeLessThanOrEqual(100);
      expect(result.dimensionScores[dim].weight).toBeGreaterThan(0);
    }
  });

  it("should generate 5-10 suggestions", () => {
    const result = computeAtsScore(sampleParsedData, []);
    expect(result.suggestions.length).toBeGreaterThanOrEqual(5);
    expect(result.suggestions.length).toBeLessThanOrEqual(10);
  });

  it("should score empty resume low", () => {
    const empty: ParsedResumeData = {
      skills: [],
      projects: [],
      education: [],
      experience: [],
      certifications: [],
    };
    const result = computeAtsScore(empty, []);
    expect(result.atsScore).toBeLessThan(50);
  });
});
