import { Router } from "express";
import { InterviewController } from "./interview.controller";
import { InterviewService } from "./interview.service";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { rateLimiter } from "../../middleware/rateLimiter";
import { createInterviewAI } from "../../lib/ai";
import {
  startSessionSchema,
  autosaveAnswerSchema,
  submitAnswerSchema,
  historyQuerySchema,
} from "./interview.validators";

export function createInterviewRouter(): Router {
  const interviewAI = createInterviewAI();
  const interviewService = new InterviewService(interviewAI);
  const controller = new InterviewController(interviewService);

  const router = Router();
  router.use(authenticate);

  const startLimiter = rateLimiter({
    keyPrefix: "interview-start",
    windowSeconds: 60 * 60,
    max: 5,
    keyFn: (req) => `user:${req.user!.userId}`,
  });

  router.post("/start", startLimiter, validate(startSessionSchema), controller.startSession);
  router.get("/history", validate(historyQuerySchema, "query"), controller.getHistory);
  router.get("/:sessionId", controller.getSession);
  router.patch("/:sessionId/answers/:questionId", validate(autosaveAnswerSchema), controller.autosaveAnswer);
  router.post("/:sessionId/answers/:questionId/submit", validate(submitAnswerSchema), controller.submitAnswer);
  router.post("/:sessionId/complete", controller.completeSession);
  router.get("/:sessionId/report", controller.getReport);
  router.post("/:sessionId/abandon", controller.abandonSession);

  return router;
}
