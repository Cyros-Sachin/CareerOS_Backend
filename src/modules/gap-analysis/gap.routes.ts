import { Router } from "express";
import { GapController } from "./gap.controller";
import { GapAnalysisService } from "./gap.service";
import { authenticate } from "../../middleware/authenticate";
import { createEmbeddingService } from "../../lib/ai";

export function createGapRouter(): Router {
  const embeddingService = createEmbeddingService();
  const gapService = new GapAnalysisService(embeddingService);
  const controller = new GapController(gapService);

  const router = Router();
  router.use(authenticate);

  router.get("/:userId", controller.analyze);

  return router;
}
