import { Router } from "express";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { rateLimiter } from "../../middleware/rateLimiter";
import {
  checkoutSchema,
  studentVerifySchema,
  historyQuerySchema,
} from "./billing.validators";

export function createBillingRouter(): Router {
  const billingService = new BillingService();
  const controller = new BillingController(billingService);

  const router = Router();

  const checkoutLimiter = rateLimiter({
    keyPrefix: "billing-checkout",
    windowSeconds: 60 * 60,
    max: 10,
    keyFn: (req) => `user:${req.user!.userId}`,
  });

  router.post("/webhook", controller.handleWebhook);

  router.use(authenticate);

  router.post("/checkout", checkoutLimiter, validate(checkoutSchema), controller.createCheckout);
  router.get("/status", controller.getStatus);
  router.get("/history", validate(historyQuerySchema, "query"), controller.getHistory);
  router.post("/student-verify", validate(studentVerifySchema), controller.studentVerify);

  return router;
}
