import { query, queryOne } from "../../db/pool";

export interface PaymentRow {
  id: string;
  user_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  plan: string;
  amount_paise: number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookEventRow {
  id: string;
  razorpay_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed_at: string;
}

export async function createPayment(data: {
  userId: string;
  razorpayOrderId: string;
  plan: string;
  amountPaise: number;
}): Promise<PaymentRow> {
  return (await queryOne<PaymentRow>(
    `INSERT INTO payments (user_id, razorpay_order_id, plan, amount_paise)
     VALUES ($1, $2, $3::plan_type, $4)
     RETURNING *`,
    [data.userId, data.razorpayOrderId, data.plan, data.amountPaise]
  ))!;
}

export async function findPaymentByOrderId(orderId: string): Promise<PaymentRow | null> {
  return queryOne<PaymentRow>(
    "SELECT * FROM payments WHERE razorpay_order_id = $1",
    [orderId]
  );
}

export async function markPaymentPaid(orderId: string, paymentId: string): Promise<PaymentRow | null> {
  return queryOne<PaymentRow>(
    `UPDATE payments SET status = 'paid', razorpay_payment_id = $1, updated_at = NOW()
     WHERE razorpay_order_id = $2 RETURNING *`,
    [paymentId, orderId]
  );
}

export async function markPaymentFailed(orderId: string): Promise<PaymentRow | null> {
  return queryOne<PaymentRow>(
    `UPDATE payments SET status = 'failed', updated_at = NOW()
     WHERE razorpay_order_id = $1 RETURNING *`,
    [orderId]
  );
}

export async function getUserPayments(userId: string, limit: number = 20): Promise<PaymentRow[]> {
  return query<PaymentRow>(
    `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
}

export async function findWebhookEventByRazorpayId(eventId: string): Promise<WebhookEventRow | null> {
  return queryOne<WebhookEventRow>(
    "SELECT * FROM subscription_webhook_events WHERE razorpay_event_id = $1",
    [eventId]
  );
}

export async function insertWebhookEvent(data: {
  razorpayEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<WebhookEventRow> {
  return (await queryOne<WebhookEventRow>(
    `INSERT INTO subscription_webhook_events (razorpay_event_id, event_type, payload)
     VALUES ($1, $2, $3::jsonb) RETURNING *`,
    [data.razorpayEventId, data.eventType, JSON.stringify(data.payload)]
  ))!;
}

export async function updateUserSubscription(data: {
  userId: string;
  tier: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `UPDATE users SET subscription_tier = $1::subscription_tier, subscription_expires_at = $2
     WHERE id = $3`,
    [data.tier, data.expiresAt, data.userId]
  );
}

export async function setStudentVerificationStatus(userId: string, status: string): Promise<void> {
  await query(
    `UPDATE users SET student_verification_status = $1::student_verification_status WHERE id = $2`,
    [status, userId]
  );
}

export async function getUserBillingStatus(userId: string): Promise<{
  subscription_tier: string;
  subscription_expires_at: string | null;
  student_verification_status: string;
} | null> {
  return queryOne(
    `SELECT subscription_tier, subscription_expires_at, student_verification_status
     FROM users WHERE id = $1`,
    [userId]
  );
}

export async function findExpiredSubscriptions(): Promise<Array<{ id: string }>> {
  return query<{ id: string }>(
    `SELECT id FROM users
     WHERE subscription_tier != 'free'
     AND subscription_expires_at < NOW()`,
    []
  );
}

export async function downgradeToFree(userId: string): Promise<void> {
  await query(`UPDATE users SET subscription_tier = 'free' WHERE id = $1`, [userId]);
}
