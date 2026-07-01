import { Router } from "express";
import { MentorController } from "./mentor.controller";
import { MentorService } from "./mentor.service";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { rateLimiter } from "../../middleware/rateLimiter";
import { createMentorChatService } from "../../lib/ai";
import { chatSchema, githubAuditSchema } from "./mentor.validators";

export function createMentorRouter(): Router {
  const mentorChat = createMentorChatService();
  const mentorService = new MentorService(mentorChat);
  const controller = new MentorController(mentorService);

  const router = Router();
  router.use(authenticate);

  const githubAuditLimiter = rateLimiter({
    keyPrefix: "github-audit",
    windowSeconds: 60 * 60,
    max: 10,
  });

  router.get("/history", controller.getHistory);
  router.post("/chat", validate(chatSchema), controller.chat);
  router.get("/suggested-prompts", controller.getSuggestedPrompts);
  router.post("/github-audit", githubAuditLimiter, validate(githubAuditSchema), controller.githubAudit);

  return router;
}
