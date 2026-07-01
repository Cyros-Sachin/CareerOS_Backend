import { Router } from "express";
import { CollegeController } from "./college.controller";
import { CollegeService } from "./college.service";
import { InstitutionMatchingService } from "./institution-matching.service";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { createBatchSchema, consentSchema, studentsQuerySchema } from "./college.validators";

export function createCollegeRouter(): Router {
  const institutionMatching = new InstitutionMatchingService();
  const collegeService = new CollegeService(institutionMatching);
  const controller = new CollegeController(collegeService);

  const router = Router();

  router.use(authenticate);

  // Admin-only: batch management
  router.post("/batches", validate(createBatchSchema), controller.createBatch);
  router.get("/batches", controller.listBatches);
  router.get("/batch/:id", controller.getBatchAnalytics);
  router.get("/batch/:id/students", validate(studentsQuerySchema, "query"), controller.getBatchStudents);

  // Student-facing: consent & institution info
  router.patch("/consent", validate(consentSchema), controller.setConsent);
  router.get("/my-institution", controller.getMyInstitution);

  return router;
}
