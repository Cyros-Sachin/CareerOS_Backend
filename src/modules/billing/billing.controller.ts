import { Request, Response, NextFunction } from "express";
import { BillingService } from "./billing.service";

export class BillingController {
  constructor(private billingService: BillingService) {}

  createCheckout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { plan } = req.body;
      const result = await this.billingService.createCheckout(req.user!.userId, plan);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  handleWebhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawBody = req.body as Buffer;
      const signature = req.headers["x-razorpay-signature"] as string;

      let event: any;
      try {
        event = JSON.parse(rawBody.toString("utf-8"));
      } catch {
        res.status(400).json({ error: { code: "INVALID_PAYLOAD", message: "Invalid webhook payload" } });
        return;
      }

      await this.billingService.handleWebhook(rawBody, signature, event);
      res.status(200).json({ status: "ok" });
    } catch (err) {
      next(err);
    }
  };

  getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.billingService.getStatus(req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = (req.query.limit as any) || 20;
      const result = await this.billingService.getHistory(req.user!.userId, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  studentVerify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { collegeEmail } = req.body;
      const result = await this.billingService.studentVerify(req.user!.userId, collegeEmail);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
