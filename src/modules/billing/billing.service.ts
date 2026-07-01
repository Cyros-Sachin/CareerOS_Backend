import { HttpError } from "../../middleware/errorHandler";
import { logger } from "../../lib/logger";
import * as repo from "./billing.repository";
import { createRazorpayOrder, fetchRazorpayPayment, RAZORPAY_KEY_ID } from "../../lib/payments/razorpay.client";
import { verifyWebhookSignature } from "../../lib/payments/webhook-signature";

const PLAN_CONFIG: Record<string, { tier: string; months: number; amountPaise: number }> = {
  student_monthly: { tier: "student", months: 1, amountPaise: 9900 },
  student_annual: { tier: "student", months: 12, amountPaise: 99900 },
  pro_monthly: { tier: "pro", months: 1, amountPaise: 19900 },
  pro_annual: { tier: "pro", months: 12, amountPaise: 199900 },
};

const COLLEGE_EMAIL_DOMAINS = [
  ".ac.in", ".edu.in", ".edu",
];

export class BillingService {
  async createCheckout(userId: string, plan: string) {
    const config = PLAN_CONFIG[plan];
    if (!config) {
      throw new HttpError(400, "INVALID_PLAN", "Invalid plan selected");
    }

    const receipt = `receipt_${userId}_${Date.now()}`;

    const order = await createRazorpayOrder({
      amountPaise: config.amountPaise,
      currency: "INR",
      receipt,
    });

    const payment = await repo.createPayment({
      userId,
      razorpayOrderId: order.id,
      plan,
      amountPaise: config.amountPaise,
    });

    logger.info({ userId, plan, orderId: order.id }, "Checkout order created");

    return {
      orderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      razorpayKeyId: RAZORPAY_KEY_ID,
      paymentId: payment.id,
    };
  }

  async handleWebhook(rawBody: Buffer, signature: string, event: any) {
    if (!verifyWebhookSignature(rawBody, signature)) {
      throw new HttpError(400, "INVALID_SIGNATURE", "Webhook signature verification failed");
    }

    const eventId = event.event_id || event.id;
    const eventType = event.event;

    if (!eventId || !eventType) {
      throw new HttpError(400, "INVALID_EVENT", "Webhook event missing id or type");
    }

    const alreadyProcessed = await repo.findWebhookEventByRazorpayId(eventId);
    if (alreadyProcessed) {
      logger.debug({ eventId }, "Webhook event already processed — skipping");
      return;
    }

    await repo.insertWebhookEvent({
      razorpayEventId: eventId,
      eventType,
      payload: event,
    });

    if (eventType === "payment.captured") {
      await this.handlePaymentCaptured(event.payload?.payment || event.payment);
    } else if (eventType === "payment.failed") {
      await this.handlePaymentFailed(event.payload?.payment || event.payment);
    }

    logger.info({ eventId, eventType }, "Webhook processed");
  }

  private async handlePaymentCaptured(payment: any) {
    const orderId = payment.order_id;
    if (!orderId) return;

    const paymentRecord = await repo.findPaymentByOrderId(orderId);
    if (!paymentRecord) {
      logger.warn({ orderId }, "Payment captured for unknown order");
      return;
    }

    if (paymentRecord.status === "paid") {
      return;
    }

    const paymentId = payment.id;
    await repo.markPaymentPaid(orderId, paymentId);

    const config = PLAN_CONFIG[paymentRecord.plan];
    if (!config) return;

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + config.months);

    await repo.updateUserSubscription({
      userId: paymentRecord.user_id,
      tier: config.tier,
      expiresAt,
    });

    logger.info(
      { userId: paymentRecord.user_id, tier: config.tier, expiresAt },
      "Subscription upgraded via webhook"
    );
  }

  private async handlePaymentFailed(payment: any) {
    const orderId = payment.order_id;
    if (!orderId) return;

    await repo.markPaymentFailed(orderId);

    logger.warn({ orderId }, "Payment failed");
  }

  async getStatus(userId: string) {
    const status = await repo.getUserBillingStatus(userId);
    if (!status) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }
    return status;
  }

  async getHistory(userId: string, limit: number = 20) {
    return repo.getUserPayments(userId, limit);
  }

  async studentVerify(userId: string, collegeEmail: string) {
    const domain = collegeEmail.split("@")[1]?.toLowerCase() || "";
    const isCollegeDomain = COLLEGE_EMAIL_DOMAINS.some((d) => domain.endsWith(d));

    if (!isCollegeDomain) {
      throw new HttpError(
        400,
        "NOT_COLLEGE_EMAIL",
        "The provided email does not appear to be from a recognized college domain"
      );
    }

    await repo.setStudentVerificationStatus(userId, "pending");

    logger.info({ userId, domain }, "Student verification requested");

    return { student_verification_status: "pending" };
  }
}
