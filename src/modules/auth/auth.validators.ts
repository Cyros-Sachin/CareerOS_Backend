import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  name: z.string().min(1).max(255),
});

export const loginSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

export const resendVerificationSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  otp: z.string().length(6).regex(/^\d{6}$/),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
