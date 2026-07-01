import Razorpay from "razorpay";
import { env } from "../../config/env";

export type RazorpayOrderResult = { id: string; amount: number; currency: string };
export type RazorpayPaymentResult = { id: string; status: string; order_id: string };

let instance: Razorpay | null = null;

function getClient(): Razorpay {
  if (!instance) {
    instance = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
  }
  return instance;
}

export async function createRazorpayOrder(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
}): Promise<RazorpayOrderResult> {
  const order = await getClient().orders.create({
    amount: params.amountPaise,
    currency: params.currency,
    receipt: params.receipt,
  });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPaymentResult> {
  const payment = await getClient().payments.fetch(paymentId);
  return { id: payment.id, status: payment.status, order_id: payment.order_id };
}

export const RAZORPAY_KEY_ID = env.RAZORPAY_KEY_ID;
