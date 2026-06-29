import { Router } from "express";
import { ResumeController } from "./resume.controller";
import { ResumeService } from "./resume.service";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { rateLimiter } from "../../middleware/rateLimiter";
import { uploadUrlSchema } from "./resume.validators";

export function createResumeRouter(): Router {
  const resumeService = new ResumeService();
  const controller = new ResumeController(resumeService);

  const router = Router();

  router.use(authenticate);

  const uploadLimiter = rateLimiter({
    keyPrefix: "resume-upload",
    windowSeconds: 60 * 60,
    max: 10,
  });

  router.post("/upload-url", uploadLimiter, validate(uploadUrlSchema), controller.requestUploadUrl);
  router.get("/history", controller.getHistory);
  router.get("/list", controller.listResumes);
  router.post("/:id/confirm", controller.confirmUpload);
  router.get("/:id/status", controller.getStatus);
  router.get("/:id/score", controller.getScore);
  router.get("/:id", controller.getResumeDetail);
  router.patch("/:id/activate", controller.activateResume);
  router.delete("/:id", controller.deleteResume);

  return router;
}