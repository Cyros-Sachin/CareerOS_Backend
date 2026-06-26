import { Router } from "express";
import { OnboardingController } from "./onboarding.controller";
import { OnboardingService } from "./onboarding.service";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step4Schema,
  completeSchema,
} from "./onboarding.validators";

export function createOnboardingRouter(): Router {
  const onboardingService = new OnboardingService();
  const controller = new OnboardingController(onboardingService);

  const router = Router();

  router.use(authenticate);

  router.get("/status", controller.getStatus);
  router.patch("/step-1", validate(step1Schema), controller.updateStep1);
  router.patch("/step-2", validate(step2Schema), controller.updateStep2);
  router.patch("/step-3", validate(step3Schema), controller.updateStep3);
  router.patch("/step-4", validate(step4Schema), controller.updateStep4);
  router.post("/complete", validate(completeSchema), controller.complete);

  return router;
}
