import { Router } from "express";
import { RoadmapController } from "./roadmap.controller";
import { RoadmapService } from "./roadmap.service";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { rateLimiter } from "../../middleware/rateLimiter";
import { GapAnalysisService } from "../gap-analysis/gap.service";
import { createEmbeddingService, createRoadmapGenerator } from "../../lib/ai";
import {
  generateRoadmapSchema,
  regenerateRoadmapSchema,
  completeItemSchema,
} from "./roadmap.validators";

export function createRoadmapRouter(): Router {
  const embeddingService = createEmbeddingService();
  const gapService = new GapAnalysisService(embeddingService);
  const roadmapGenerator = createRoadmapGenerator();
  const roadmapService = new RoadmapService(gapService, roadmapGenerator);
  const controller = new RoadmapController(roadmapService);

  const router = Router();
  router.use(authenticate);

  const generateLimiter = rateLimiter({
    keyPrefix: "roadmap-generate",
    windowSeconds: 60 * 60,
    max: 5,
    keyFn: (req) => `user:${req.user!.userId}`,
  });

  router.post("/generate", generateLimiter, validate(generateRoadmapSchema), controller.generate);
  router.get("/:userId", controller.getActive);
  router.get("/detail/:roadmapId", controller.getDetail);
  router.patch("/items/:itemId/complete", validate(completeItemSchema), controller.toggleComplete);
  router.post("/:roadmapId/regenerate", generateLimiter, validate(regenerateRoadmapSchema), controller.regenerate);
  router.get("/:roadmapId/export.pdf", controller.exportPdf);

  return router;
}
