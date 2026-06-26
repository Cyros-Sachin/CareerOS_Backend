import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { createOnboardingRouter } from "./modules/onboarding/onboarding.routes";
import { errorHandler } from "./middleware/errorHandler";
import { generalLimiter } from "./middleware/rateLimiter";
import { pool } from "./db/pool";
import { redisPing } from "./lib/redis";
import { EmailService } from "./lib/email/email.service";
import { ResendProvider } from "./lib/email/resend.provider";

export function createApp(emailService?: EmailService) {
  const app = express();

  app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api", generalLimiter);

  const mailer = emailService || new ResendProvider();
  app.use("/api/auth", createAuthRouter(mailer));
  app.use("/api/onboarding", createOnboardingRouter());

  app.get("/api/health", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      const redisOk = await redisPing();
      const status = redisOk ? "healthy" : "degraded (redis down)";
      res.json({ status, redis: redisOk, database: true });
    } catch {
      res.status(503).json({ status: "unhealthy", database: false });
    }
  });

  app.use(errorHandler);

  return app;
}
