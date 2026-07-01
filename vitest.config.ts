import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: ["./tests/setup.ts"],
    env: {
      RAZORPAY_WEBHOOK_SECRET: "test-webhook-secret",
    },
  },
});
