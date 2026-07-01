import { hashToken, generateRandomToken, hashOtp, generateOtp } from "../../lib/otp";
import { signAccessToken, JwtPayload } from "../../lib/jwt";
import { hashPassword, verifyPassword } from "../../lib/password";
import { EmailService } from "../../lib/email/email.service";
import { verifyEmailTemplate, resetPasswordTemplate } from "../../lib/email/templates/verify-email";
import { HttpError } from "../../middleware/errorHandler";
import { logger } from "../../lib/logger";
import { InstitutionMatchingService } from "../college/institution-matching.service";
import * as repo from "./auth.repository";
import crypto from "crypto";

export class AuthService {
  private institutionMatching = new InstitutionMatchingService();

  constructor(private emailService: EmailService) {}

  async register(email: string, password: string, name: string): Promise<void> {
    const existing = await repo.findByEmail(email);
    if (existing) {
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await repo.createUser({ email, passwordHash, name });

    await this.institutionMatching.linkUserToInstitution(user.id, email);

    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await repo.createEmailVerificationToken({ userId: user.id, tokenHash, expiresAt });

    try {
      const { subject, html } = verifyEmailTemplate(rawToken);
      await this.emailService.sendEmail({ to: email, subject, html });
    } catch (err) {
      logger.error({ err, email }, "Failed to send verification email");
    }
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    const record = await repo.findEmailVerificationToken(tokenHash);
    if (!record) {
      throw new HttpError(400, "INVALID_TOKEN", "Invalid or expired verification token");
    }
    if (record.used_at) {
      throw new HttpError(400, "TOKEN_USED", "Verification token already used");
    }
    if (new Date(record.expires_at) < new Date()) {
      throw new HttpError(400, "TOKEN_EXPIRED", "Verification token has expired");
    }

    await repo.markEmailVerified(record.user_id);
    await repo.markEmailVerificationTokenUsed(record.id);
  }

  async resendVerification(email: string): Promise<void> {
    const user = await repo.findByEmail(email);
    if (!user || user.email_verified) {
      return;
    }

    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await repo.createEmailVerificationToken({ userId: user.id, tokenHash, expiresAt });

    try {
      const { subject, html } = verifyEmailTemplate(rawToken);
      await this.emailService.sendEmail({ to: email, subject, html });
    } catch (err) {
      logger.error({ err, email }, "Failed to send verification email");
    }
  }

  async login(email: string, password: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; name: string; role: string };
  }> {
    const user = await repo.findByEmail(email);
    if (!user) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    if (!user.email_verified) {
      throw new HttpError(403, "EMAIL_NOT_VERIFIED", "Please verify your email before logging in");
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      throw new HttpError(423, "ACCOUNT_LOCKED", `Account locked. Try again in ${remaining} minutes`);
    }

    if (!user.password_hash) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      await repo.incrementFailedAttempts(user.id);

      const updatedUser = await repo.findById(user.id);
      if (updatedUser && updatedUser.failed_login_attempts >= 5) {
        await repo.lockAccount(user.id);
      }

      throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    await repo.resetFailedAttempts(user.id);

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const { rawToken, tokenId } = await this.createAndStoreRefreshToken(user.id);

    return {
      accessToken,
      refreshToken: rawToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async refresh(refreshTokenStr: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const tokenHash = hashToken(refreshTokenStr);
    const record = await repo.findRefreshTokenByHash(tokenHash);

    if (!record) {
      throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Refresh token not found");
    }

    if (record.revoked_at) {
      await repo.revokeAllUserRefreshTokens(record.user_id);
      throw new HttpError(401, "TOKEN_REUSE_DETECTED", "Refresh token was revoked — all tokens revoked for security");
    }

    if (new Date(record.expires_at) < new Date()) {
      throw new HttpError(401, "TOKEN_EXPIRED", "Refresh token has expired");
    }

    await repo.revokeRefreshToken(record.id);

    const { rawToken } = await this.createAndStoreRefreshToken(record.user_id);

    const user = await repo.findById(record.user_id);
    if (!user) {
      throw new HttpError(401, "USER_NOT_FOUND", "User not found");
    }

    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return { accessToken, refreshToken: rawToken };
  }

  async logout(userId: string, refreshTokenStr: string): Promise<void> {
    const tokenHash = hashToken(refreshTokenStr);
    const record = await repo.findRefreshTokenByHash(tokenHash);
    if (record && record.user_id === userId) {
      await repo.revokeRefreshToken(record.id);
    }
  }

  async getMe(userId: string) {
    const user = await repo.getPublicUserProfile(userId);
    if (!user) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }
    return user;
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await repo.findByEmail(email);
    if (!user) {
      return;
    }

    await repo.invalidatePreviousOtps(user.id);

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await repo.createPasswordResetOtp({ userId: user.id, otpHash, expiresAt });

    try {
      const { subject, html } = resetPasswordTemplate(otp);
      await this.emailService.sendEmail({ to: email, subject, html });
    } catch (err) {
      logger.error({ err, email }, "Failed to send password reset email");
    }
  }

  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    const user = await repo.findByEmail(email);
    if (!user) {
      throw new HttpError(400, "INVALID_OTP", "Invalid or expired OTP");
    }

    const otpRecord = await repo.findLatestUnusedOtp(user.id);
    if (!otpRecord) {
      throw new HttpError(400, "INVALID_OTP", "Invalid or expired OTP");
    }

    if (otpRecord.attempt_count >= 5) {
      await repo.markOtpUsed(otpRecord.id);
      throw new HttpError(400, "OTP_EXHAUSTED", "Too many wrong attempts — request a new OTP");
    }

    const otpHash = hashOtp(otp);
    if (otpRecord.otp_hash !== otpHash) {
      await repo.incrementOtpAttempt(otpRecord.id);
      const remaining = 4 - otpRecord.attempt_count;
      throw new HttpError(400, "INVALID_OTP", `Invalid OTP. ${remaining} attempts remaining`);
    }

    const passwordHash = await hashPassword(newPassword);
    await repo.updatePassword(user.id, passwordHash);
    await repo.markOtpUsed(otpRecord.id);
    await repo.revokeAllUserRefreshTokens(user.id);
  }

  async createAndStoreRefreshToken(userId: string): Promise<{ rawToken: string; tokenId: string }> {
    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const id = crypto.randomUUID();
    await repo.createRefreshToken({ userId, tokenHash, expiresAt });
    return { rawToken, tokenId: id };
  }
}
