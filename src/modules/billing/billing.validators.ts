import { z } from "zod";

export const checkoutSchema = z.object({
  plan: z.enum(["student_monthly", "student_annual", "pro_monthly", "pro_annual"]),
});

export const studentVerifySchema = z.object({
  collegeEmail: z.string().email("A valid college email is required"),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type StudentVerifyInput = z.infer<typeof studentVerifySchema>;
