import { Router } from "express";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { rateLimiter } from "../../middleware/rateLimiter";
import { createJobExtractionService, createInterviewAI } from "../../lib/ai";
import {
  matchesQuerySchema,
  manualJobSchema,
  applyJobSchema,
  updateApplicationSchema,
  applicationsQuerySchema,
} from "./jobs.validators";

export function createJobsRouter(): Router {
  const jobExtraction = createJobExtractionService();
  const interviewAI = createInterviewAI();
  const jobsService = new JobsService(jobExtraction, interviewAI);
  const controller = new JobsController(jobsService);

  const router = Router();
  router.use(authenticate);

  const tailorLimiter = rateLimiter({
    keyPrefix: "jobs-tailor",
    windowSeconds: 60 * 60,
    max: 5,
    keyFn: (req) => `user:${req.user!.userId}`,
  });

  const manualLimiter = rateLimiter({
    keyPrefix: "jobs-manual",
    windowSeconds: 60 * 60,
    max: 10,
    keyFn: (req) => `user:${req.user!.userId}`,
  });

  router.get("/matches", validate(matchesQuerySchema, "query"), controller.getMatches);
  router.get("/applications", validate(applicationsQuerySchema, "query"), controller.getApplications);
  router.get("/tailored/:tailoredResumeId", controller.getTailoredResume);
  router.post("/manual", manualLimiter, validate(manualJobSchema), controller.submitManualJob);
  router.get("/:jobId", controller.getJobDetail);
  router.post("/:jobId/tailor-resume", tailorLimiter, controller.tailorResume);
  router.post("/:jobId/apply", validate(applyJobSchema), controller.applyToJob);
  router.patch("/applications/:applicationId", validate(updateApplicationSchema), controller.updateApplication);

  return router;
}
