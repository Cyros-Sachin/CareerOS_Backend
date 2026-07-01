import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { signAccessToken } from "../src/lib/jwt";
import { hashPassword } from "../src/lib/password";
import type { EmailService } from "../src/lib/email/email.service";

class MockEmailService implements EmailService {
  async sendEmail(): Promise<void> {}
}

const mockEmail = new MockEmailService();
const app = createApp(mockEmail);

let adminToken = "";
let adminId = "";
let studentToken = "";
let studentId = "";
let otherAdminToken = "";
let institutionAId: string;
let institutionBId: string;
let batchId: string;

beforeAll(async () => {
  await pool.query("UPDATE users SET batch_id = NULL, institution_id = NULL WHERE email LIKE 'test-%'");
  await pool.query("DELETE FROM job_applications");
  await pool.query("DELETE FROM interview_sessions");
  await pool.query("DELETE FROM roadmap_items");
  await pool.query("DELETE FROM roadmaps");
  await pool.query("DELETE FROM resumes");
  await pool.query("DELETE FROM users WHERE email LIKE 'test-%'");
  await pool.query("DELETE FROM institution_batches");
  await pool.query("DELETE FROM institutions");
  await pool.query("DELETE FROM subscription_webhook_events");
  await pool.query("DELETE FROM payments");

  // Institution A with admin + students
  const instA = await pool.query(
    `INSERT INTO institutions (name, domain, contact_email)
     VALUES ('University A', 'univa.edu', 'admin@univa.edu') RETURNING id`
  );
  institutionAId = instA.rows[0].id;

  const adminA = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, institution_id, email_verified, onboarding_completed)
     VALUES ($1, $2, $3, 'institution_admin', $4, TRUE, TRUE) RETURNING id`,
    ["test-college-admin-a@test.com", await hashPassword("TestPass123"), "Admin A", institutionAId]
  );
  adminId = adminA.rows[0].id;
  adminToken = signAccessToken({ userId: adminId, email: "admin-a@test.com", role: "institution_admin" });

  // Institution B with admin
  const instB = await pool.query(
    `INSERT INTO institutions (name, domain, contact_email)
     VALUES ('University B', 'univb.edu', 'admin@univb.edu') RETURNING id`
  );
  institutionBId = instB.rows[0].id;

  const adminB = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, institution_id, email_verified, onboarding_completed)
     VALUES ($1, $2, $3, 'institution_admin', $4, TRUE, TRUE) RETURNING id`,
    ["test-college-admin-b@test.com", await hashPassword("TestPass123"), "Admin B", institutionBId]
  );
  otherAdminToken = signAccessToken({ userId: adminB.rows[0].id, email: "admin-b@test.com", role: "institution_admin" });

  // Student user (institution A, consenting)
  const student = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, institution_id, degree, graduation_year, onboarding_completed, institution_data_sharing_consent, subscription_tier, career_goals, skill_level)
     VALUES ($1, $2, $3, 'student', $4, 'B.Tech', 2027, TRUE, TRUE, 'free', $5::text[], 'advanced') RETURNING id`,
    ["test-college-student@test.com", await hashPassword("TestPass123"), "Student One", institutionAId, ["Software Engineer"]]
  );
  studentId = student.rows[0].id;
  studentToken = signAccessToken({ userId: studentId, email: "student@test.com", role: "student" });
});

afterAll(async () => {
  await pool.end();
});

describe("College — Auth Protection", () => {
  it("should return 401 without auth token on all endpoints", async () => {
    const endpoints = [
      { method: "post" as const, path: "/api/college/batches", body: { degree: "B.Tech", graduationYear: 2027 } },
      { method: "get" as const, path: "/api/college/batches" },
      { method: "get" as const, path: `/api/college/batch/${batchId || "none"}` },
      { method: "get" as const, path: `/api/college/batch/${batchId || "none"}/students` },
      { method: "patch" as const, path: "/api/college/consent", body: { consent: true } },
      { method: "get" as const, path: "/api/college/my-institution" },
    ];

    for (const ep of endpoints) {
      const req = request(app)[ep.method](ep.path);
      if (ep.body) req.send(ep.body);
      const res = await req;
      expect(res.status, `${ep.method.toUpperCase()} ${ep.path} should return 401`).toBe(401);
    }
  });
});

describe("College — Batch CRUD", () => {
  it("should create a batch (institution_admin)", async () => {
    const res = await request(app)
      .post("/api/college/batches")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ degree: "B.Tech", graduationYear: 2027, label: "B.Tech 2024-2027" });

    expect(res.status).toBe(201);
    expect(res.body.degree).toBe("B.Tech");
    expect(res.body.graduation_year).toBe(2027);
    batchId = res.body.id;
  });

  it("should backfill batch_id for matching students on batch creation", async () => {
    const updated = await pool.query("SELECT batch_id FROM users WHERE id = $1", [studentId]);
    expect(updated.rows[0].batch_id).toBe(batchId);
  });

  it("should list batches for admin's institution", async () => {
    const res = await request(app)
      .get("/api/college/batches")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].institution_id).toBe(institutionAId);
  });

  it("should return 400 when admin has no institution", async () => {
    const orphanAdmin = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, email_verified)
       VALUES ($1, $2, $3, 'institution_admin', TRUE) RETURNING id`,
      ["test-orphan-admin@test.com", await hashPassword("TestPass123"), "Orphan Admin"]
    );
    const token = signAccessToken({
      userId: orphanAdmin.rows[0].id,
      email: "orphan@test.com",
      role: "institution_admin",
    });

    const res = await request(app)
      .post("/api/college/batches")
      .set("Authorization", `Bearer ${token}`)
      .send({ degree: "B.Tech", graduationYear: 2027 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NO_INSTITUTION");
  });

  it("student role should be able to access (no role gate on routes)", async () => {
    const res = await request(app)
      .get("/api/college/batches")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
  });
});

describe("College — Batch Analytics", () => {
  it("should return batch analytics for admin's own institution", async () => {
    const res = await request(app)
      .get(`/api/college/batch/${batchId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.batchId).toBe(batchId);
    expect(res.body.headcount).toBeDefined();
    expect(res.body.headcount.total_linked).toBeGreaterThanOrEqual(1);
    expect(res.body.onboarding).toBeDefined();
    expect(res.body.resume).toBeDefined();
    expect(res.body.roadmap).toBeDefined();
    expect(res.body.interviews).toBeDefined();
    expect(res.body.jobs).toBeDefined();
  });

  it("should return 403 for admin from another institution", async () => {
    const res = await request(app)
      .get(`/api/college/batch/${batchId}`)
      .set("Authorization", `Bearer ${otherAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("should return 404 for non-existent batch", async () => {
    const res = await request(app)
      .get("/api/college/batch/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("BATCH_NOT_FOUND");
  });
});

describe("College — Student Roster", () => {
  it("should list consenting students in the batch", async () => {
    const res = await request(app)
      .get(`/api/college/batch/${batchId}/students`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].name).toBe("Student One");
  });

  it("should exclude non-consenting students from roster", async () => {
    // Add a non-consenting student to the batch
    const nonConsenting = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, institution_id, batch_id, degree, graduation_year, onboarding_completed, institution_data_sharing_consent)
       VALUES ($1, $2, $3, 'student', $4, $5, 'B.Tech', 2027, TRUE, FALSE) RETURNING id`,
      ["test-non-consenting@test.com", await hashPassword("TestPass123"), "Non Consenting", institutionAId, batchId]
    );

    const res = await request(app)
      .get(`/api/college/batch/${batchId}/students`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.find((s: any) => s.id === nonConsenting.rows[0].id)).toBeUndefined();
  });

  it("should return 403 for cross-institution roster access", async () => {
    const res = await request(app)
      .get(`/api/college/batch/${batchId}/students`)
      .set("Authorization", `Bearer ${otherAdminToken}`);

    expect(res.status).toBe(403);
  });
});

describe("College — Consent Toggle", () => {
  it("should toggle consent on and off", async () => {
    const res1 = await request(app)
      .patch("/api/college/consent")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ consent: false });

    expect(res1.status).toBe(200);
    expect(res1.body.consent).toBe(false);

    const res2 = await request(app)
      .patch("/api/college/consent")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ consent: true });

    expect(res2.status).toBe(200);
    expect(res2.body.consent).toBe(true);
  });

  it("should exclude consent-revoked student from analytics", async () => {
    await request(app)
      .patch("/api/college/consent")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ consent: false });

    const res = await request(app)
      .get(`/api/college/batch/${batchId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.headcount.consenting).toBeLessThan(res.body.headcount.total_linked);

    // Restore consent
    await request(app)
      .patch("/api/college/consent")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ consent: true });
  });
});

describe("College — My Institution", () => {
  it("should return institution info for linked student", async () => {
    const res = await request(app)
      .get("/api/college/my-institution")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.institution_id).toBe(institutionAId);
    expect(res.body.institution_name).toBe("University A");
    expect(res.body.batch_id).toBe(batchId);
    expect(res.body.institution_data_sharing_consent).toBe(true);
  });

  it("should return null fields for unlinked user", async () => {
    const unlinked = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, email_verified)
       VALUES ($1, $2, $3, 'student', TRUE) RETURNING id`,
      ["test-unlinked@test.com", await hashPassword("TestPass123"), "Unlinked"]
    );
    const token = signAccessToken({
      userId: unlinked.rows[0].id,
      email: "unlinked@test.com",
      role: "student",
    });

    const res = await request(app)
      .get("/api/college/my-institution")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.institution_id).toBeNull();
    expect(res.body.batch_id).toBeNull();
  });
});
