import { describe, it, expect, vi, beforeAll } from "vitest";
import { createHmac } from "crypto";

vi.mock("../src/config/env", () => ({
  env: {
    RAZORPAY_WEBHOOK_SECRET: "test-webhook-secret-123",
    DATABASE_URL: "postgres://mock:mock@localhost:5432/mock",
    REDIS_URL: "redis://localhost:6379",
    JWT_ACCESS_SECRET: "a".repeat(32),
    JWT_REFRESH_SECRET: "b".repeat(32),
    RAZORPAY_KEY_ID: "rzp_test_xxxx",
    RAZORPAY_KEY_SECRET: "test_secret",
  },
}));

let verifyWebhookSignature: (rawBody: Buffer, signature: string) => boolean;

beforeAll(async () => {
  const mod = await import("../src/lib/payments/webhook-signature");
  verifyWebhookSignature = mod.verifyWebhookSignature;
});

function computeValidSignature(rawBody: Buffer): string {
  return createHmac("sha256", "test-webhook-secret-123")
    .update(rawBody)
    .digest("hex");
}

describe("Webhook Signature Verification", () => {
  it("should pass for a valid signature over the raw body", () => {
    const rawBody = Buffer.from(JSON.stringify({ event: "payment.captured", id: "evt_001" }));
    const signature = computeValidSignature(rawBody);
    expect(verifyWebhookSignature(rawBody, signature)).toBe(true);
  });

  it("should fail for a tampered body with an otherwise valid signature", () => {
    const rawBody = Buffer.from(JSON.stringify({ event: "payment.captured", id: "evt_001" }));
    const tamperedBody = Buffer.from(JSON.stringify({ event: "payment.captured", id: "evt_002" }));
    const signature = computeValidSignature(tamperedBody);
    expect(verifyWebhookSignature(rawBody, signature)).toBe(false);
  });

  it("should fail when signature is computed over differently-formatted JSON", () => {
    const originalCompact = JSON.stringify({ event: "payment.captured", data: { key: "value" } });
    const rawBody = Buffer.from(originalCompact);
    const prettyPrinted = JSON.stringify(JSON.parse(originalCompact), null, 2);
    const reSerialized = Buffer.from(prettyPrinted);
    const signature = computeValidSignature(rawBody);
    expect(verifyWebhookSignature(reSerialized, signature)).toBe(false);
  });

  it("should return false when webhook secret is empty", async () => {
    const envMod = await import("../src/config/env");
    vi.mocked(envMod).env.RAZORPAY_WEBHOOK_SECRET = "";
    const rawBody = Buffer.from("{}");
    expect(verifyWebhookSignature(rawBody, "any-signature")).toBe(false);
  });

  it("should return false for an empty signature", () => {
    const rawBody = Buffer.from("{}");
    const signature = computeValidSignature(rawBody);
    expect(verifyWebhookSignature(rawBody, "")).toBe(false);
  });
});
