import { Router } from "express";
import { SkillsController } from "./skills.controller";
import { SkillsService } from "./skills.service";
import { authenticate } from "../../middleware/authenticate";

export function createSkillsRouter(): Router {
  const skillsService = new SkillsService();
  const controller = new SkillsController(skillsService);

  const router = Router();
  router.use(authenticate);

  router.get("/", controller.browse);
  router.get("/categories", controller.getCategories);

  return router;
}
