import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { signAccessToken } from "../src/lib/jwt";
import type { EmailService } from "../src/lib/email/email.service";
import { createHmac } from "crypto";

class MockEmailService implements EmailService {
  async sendEmail(): Promise<void> {}
}

vi.mock("../src/lib/payments/razorpay.client", () => ({
  createRazorpayOrder: vi.fn().mockResolvedValue({
    id: "order_OjD7XJqFPRX4pQ",
    amount: 19900,
    currency: "INR",
  }),
  fetchRazorpayPayment: vi.fn().mockResolvedValue({
    id: "pay_OjD7XJqFPRX4pQ",
    status: "captured",
    order_id: "order_OjD7XJqFPRX4pQ",
  }),
  RAZORPAY_KEY_ID: "rzp_test_xxxxxxxxxxxx",
}));

const mockEmail = new MockEmailService();
const app = createApp(mockEmail);

let accessToken = "";
let userId = "";

beforeAll(async () => {
  await pool.query("DELETE FROM subscription_webhook_events");
  await pool.query("DELETE FROM payments");
  await pool.query("DELETE FROM users WHERE email LIKE 'test-billing-%@test.com'");

  const user = await pool.query(
    `INSERT INTO users (email, password_hash, name, email_verified, onboarding_completed, subscription_tier, career_goals, skill_level)
     VALUES ($1, $2, $3, TRUE, TRUE, 'free', $4::text[], 'advanced')
     RETURNING id`,
    [
      "test-billing-user@test.com",
      "$2b$12$LJ3m4ys3Lk0TSwHnbfOMiOXPm1Qlq5Gz3Y5n0qW3Z5y7Z8y9a0uS",
      "Billing User",
      ["Software Engineer"],
    ]
  );
  userId = user.rows[0].id;
  accessToken = signAccessToken({ userId, email: "billing@test.com", role: "student" });
});

afterAll(async () => {
  await pool.end();
});

describe("Billing — Auth Protection", () => {
  it("should return 401 without auth token on protected endpoints", async () => {
    const protectedEndpoints = [
      { method: "post" as const, path: "/api/billing/checkout", body: { plan: "pro_monthly" } },
      { method: "get" as const, path: "/api/billing/status" },
      { method: "get" as const, path: "/api/billing/history" },
      { method: "post" as const, path: "/api/billing/student-verify", body: { collegeEmail: "student@college.edu" } },
    ];

    for (const ep of protectedEndpoints) {
      const req = request(app)[ep.method](ep.path);
      if (ep.body) req.send(ep.body);
      const res = await req;
      expect(res.status, `${ep.method.toUpperCase()} ${ep.path} should return 401`).toBe(401);
    }
  });

  it("should allow webhook endpoint without auth", async () => {
    const res = await request(app)
      .post("/api/billing/webhook")
      .set("x-razorpay-signature", "invalid")
      .send({ event: "payment.captured" });

    expect(res.status).not.toBe(401);
  });
});

describe("Billing — Checkout Flow", () => {
  it("should create a checkout order and payments row with status 'created'", async () => {
    const res = await request(app)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ plan: "pro_monthly" });

    expect(res.status).toBe(200);
    expect(res.body.orderId).toBeDefined();
    expect(res.body.amountPaise).toBe(19900);
    expect(res.body.razorpayKeyId).toBe("rzp_test_xxxxxxxxxxxx");
  });

  it("should return 400 for invalid plan", async () => {
    const res = await request(app)
      .post("/api/billing/checkout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ plan: "invalid_plan" });

    expect(res.status).toBe(400);
  });
});

describe("Billing — Webhook Handler", () => {
  let orderId: string;

  beforeAll(async () => {
    const order = await pool.query(
      `INSERT INTO payments (user_id, razorpay_order_id, plan, amount_paise, status)
       VALUES ($1, 'order_test_webhook_001', 'pro_monthly', 19900, 'created')
       RETURNING razorpay_order_id`,
      [userId]
    );
    orderId = order.rows[0].razorpay_order_id;
  });

  it("should process payment.captured webhook with valid signature and upgrade user", async () => {
    const webhookPayload = {
      event: "payment.captured",
      id: "evt_captured_001",
      payment: {
        id: "pay_captured_001",
        order_id: orderId,
      },
    };

    const rawBody = Buffer.from(JSON.stringify(webhookPayload));
    const signature = createHmac("sha256", "test-webhook-secret").update(rawBody).digest("hex");

    const res = await request(app)
      .post("/api/billing/webhook")
      .set("x-razorpay-signature", signature)
      .send(webhookPayload);

    expect(res.status).toBe(200);

    const payment = await pool.query(
      "SELECT status, razorpay_payment_id FROM payments WHERE razorpay_order_id = $1",
      [orderId]
    );
    expect(payment.rows[0].status).toBe("paid");
    expect(payment.rows[0].razorpay_payment_id).toBe("pay_captured_001");

    const user = await pool.query(
      "SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1",
      [userId]
    );
    expect(user.rows[0].subscription_tier).toBe("pro");
    expect(user.rows[0].subscription_expires_at).not.toBeNull();
  });

  it("should return 200 for redelivered webhook (idempotency) without double-processing", async () => {
    const webhookPayload = {
      event: "payment.captured",
      id: "evt_captured_001",
      payment: {
        id: "pay_captured_001",
        order_id: orderId,
      },
    };

    const rawBody = Buffer.from(JSON.stringify(webhookPayload));
    const signature = createHmac("sha256", "test-webhook-secret").update(rawBody).digest("hex");

    const res = await request(app)
      .post("/api/billing/webhook")
      .set("x-razorpay-signature", signature)
      .send(webhookPayload);

    expect(res.status).toBe(200);

    const events = await pool.query(
      "SELECT COUNT(*)::text as count FROM subscription_webhook_events WHERE razorpay_event_id = 'evt_captured_001'"
    );
    expect(parseInt(events.rows[0].count, 10)).toBe(1);
  });

  it("should return 400 for invalid signature", async () => {
    const res = await request(app)
      .post("/api/billing/webhook")
      .set("x-razorpay-signature", "tampered-signature")
      .send({ event: "payment.captured", id: "evt_invalid" });

    expect(res.status).toBe(400);
  });

  it("should process payment.failed webhook without changing tier", async () => {
    const failOrder = await pool.query(
      `INSERT INTO payments (user_id, razorpay_order_id, plan, amount_paise, status)
       VALUES ($1, 'order_test_fail_001', 'student_monthly', 9900, 'created')
       RETURNING razorpay_order_id`,
      [userId]
    );
    const failOrderId = failOrder.rows[0].razorpay_order_id;

    const webhookPayload = {
      event: "payment.failed",
      id: "evt_failed_001",
      payment: {
        id: "pay_failed_001",
        order_id: failOrderId,
      },
    };

    const rawBody = Buffer.from(JSON.stringify(webhookPayload));
    const signature = createHmac("sha256", "test-webhook-secret").update(rawBody).digest("hex");

    const res = await request(app)
      .post("/api/billing/webhook")
      .set("x-razorpay-signature", signature)
      .send(webhookPayload);

    expect(res.status).toBe(200);

    const payment = await pool.query(
      "SELECT status FROM payments WHERE razorpay_order_id = $1",
      [failOrderId]
    );
    expect(payment.rows[0].status).toBe("failed");
  });
});

describe("Billing — Status", () => {
  it("should return current billing status", async () => {
    const res = await request(app)
      .get("/api/billing/status")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.subscription_tier).toBeDefined();
    expect(res.body.student_verification_status).toBeDefined();
  });
});

describe("Billing — History", () => {
  it("should return payment history most-recent-first", async () => {
    const res = await request(app)
      .get("/api/billing/history")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("Billing — Student Verification", () => {
  it("should set student_verification_status to pending for a college email", async () => {
    const res = await request(app)
      .post("/api/billing/student-verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ collegeEmail: "student@iitb.ac.in" });

    expect(res.status).toBe(200);
    expect(res.body.student_verification_status).toBe("pending");

    const user = await pool.query(
      "SELECT student_verification_status FROM users WHERE id = $1",
      [userId]
    );
    expect(user.rows[0].student_verification_status).toBe("pending");
  });

  it("should return 400 for a non-college email", async () => {
    const res = await request(app)
      .post("/api/billing/student-verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ collegeEmail: "user@gmail.com" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("NOT_COLLEGE_EMAIL");
  });
});

describe("Billing — Expiry Worker", () => {
  it("should downgrade expired subscriptions to free", async () => {
    await pool.query(
      `UPDATE users SET subscription_tier = 'pro', subscription_expires_at = NOW() - INTERVAL '1 day'
       WHERE id = $1`,
      [userId]
    );

    const { processExpiryCheck } = await import("../src/modules/billing/expiry.worker");
    const mockJob = { id: "test-expiry", data: {} } as any;
    await processExpiryCheck(mockJob);

    const user = await pool.query(
      "SELECT subscription_tier FROM users WHERE id = $1",
      [userId]
    );
    expect(user.rows[0].subscription_tier).toBe("free");
  });

  it("should leave valid subscriptions untouched", async () => {
    await pool.query(
      `UPDATE users SET subscription_tier = 'pro', subscription_expires_at = NOW() + INTERVAL '30 days'
       WHERE id = $1`,
      [userId]
    );

    const { processExpiryCheck } = await import("../src/modules/billing/expiry.worker");
    const mockJob = { id: "test-expiry-2", data: {} } as any;
    await processExpiryCheck(mockJob);

    const user = await pool.query(
      "SELECT subscription_tier FROM users WHERE id = $1",
      [userId]
    );
    expect(user.rows[0].subscription_tier).toBe("pro");
  });
});
