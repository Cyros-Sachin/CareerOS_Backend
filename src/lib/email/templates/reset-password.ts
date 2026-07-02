import { env } from "../../../config/env";

export function resetPasswordTemplate(otp: string): { subject: string; html: string } {
  return {
    subject: "Password Reset Code — CareerOS",
    html: `
      <h1>Reset your password</h1>
      <p>Use the following 6-digit code to reset your password:</p>
      <div style="font-size:32px;letter-spacing:8px;text-align:center;padding:16px;background:#f3f4f6;border-radius:8px;font-weight:bold;">${otp}</div>
      <p>This code expires in 10 minutes.</p>
      <p>If you didn't request a password reset, you can ignore this email.</p>
    `,
  };
}
