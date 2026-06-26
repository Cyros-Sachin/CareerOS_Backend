import { env } from "../../../config/env";

export function verifyEmailTemplate(token: string): { subject: string; html: string } {
  const url = `${env.FRONTEND_URL}/verify-email?token=${token}`;
  return {
    subject: "Verify your email — CareerOS",
    html: `
      <h1>Welcome to CareerOS!</h1>
      <p>Click the link below to verify your email address:</p>
      <a href="${url}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:6px;">Verify Email</a>
      <p>This link expires in 24 hours.</p>
      <p>If you didn't sign up, you can ignore this email.</p>
    `,
  };
}

export function resetPasswordTemplate(otp: string): { subject: string; html: string } {
  return {
    subject: "Password reset code — CareerOS",
    html: `
      <h1>Reset your password</h1>
      <p>Use the following 6-digit code to reset your password:</p>
      <div style="font-size:32px;letter-spacing:8px;text-align:center;padding:16px;background:#f3f4f6;border-radius:8px;font-weight:bold;">${otp}</div>
      <p>This code expires in 10 minutes.</p>
      <p>If you didn't request a password reset, you can ignore this email.</p>
    `,
  };
}
