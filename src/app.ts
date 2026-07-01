import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { createOnboardingRouter } from "./modules/onboarding/onboarding.routes";
import { createResumeRouter } from "./modules/resume/resume.routes";
import { createSkillsRouter } from "./modules/skills/skills.routes";
import { createGapRouter } from "./modules/gap-analysis/gap.routes";
import { createRoadmapRouter } from "./modules/roadmap/roadmap.routes";
import { createMentorRouter } from "./modules/mentor/mentor.routes";
import { createInterviewRouter } from "./modules/interview/interview.routes";
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
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api", generalLimiter);

  const mailer = emailService || new ResendProvider();
  app.use("/api/auth", createAuthRouter(mailer));
  app.use("/api/onboarding", createOnboardingRouter());
  app.use("/api/resume", createResumeRouter());
  app.use("/api/skills", createSkillsRouter());
  app.use("/api/gaps", createGapRouter());
  app.use("/api/roadmap", createRoadmapRouter());
  app.use("/api/mentor", createMentorRouter());
  app.use("/api/interview", createInterviewRouter());

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
