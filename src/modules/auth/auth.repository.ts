import { query, queryOne } from "../../db/pool";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  google_id: string | null;
  email_verified: boolean;
  college: string | null;
  degree: string | null;
  graduation_year: number | null;
  career_goals: string[];
  work_preferences: string[];
  target_companies: string[];
  skill_level: string | null;
  onboarding_step: number;
  onboarding_completed: boolean;
  subscription_tier: string;
  failed_login_attempts: number;
  locked_until: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
}

export async function findById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
}

export async function findByGoogleId(googleId: string): Promise<UserRow | null> {
  return queryOne<UserRow>("SELECT * FROM users WHERE google_id = $1", [googleId]);
}

export async function createUser(data: {
  email: string;
  passwordHash: string | null;
  name: string;
  googleId?: string;
}): Promise<UserRow> {
  const row = await queryOne<UserRow>(
    `INSERT INTO users (email, password_hash, name, google_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.email, data.passwordHash, data.name, data.googleId || null]
  );
  return row!;
}

export async function updatePassword(userId: string, passwordHash: string): Promise<void> {
  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
}

export async function markEmailVerified(userId: string): Promise<void> {
  await query("UPDATE users SET email_verified = TRUE WHERE id = $1", [userId]);
}

export async function incrementFailedAttempts(userId: string): Promise<void> {
  await query(
    `UPDATE users SET failed_login_attempts = failed_login_attempts + 1
     WHERE id = $1`,
    [userId]
  );
}

export async function lockAccount(userId: string): Promise<void> {
  await query(
    `UPDATE users SET locked_until = NOW() + INTERVAL '30 minutes'
     WHERE id = $1`,
    [userId]
  );
}

export async function resetFailedAttempts(userId: string): Promise<void> {
  await query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL
     WHERE id = $1`,
    [userId]
  );
}

export async function createRefreshToken(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [data.userId, data.tokenHash, data.expiresAt]
  );
}

export async function findRefreshTokenByHash(tokenHash: string): Promise<{
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
} | null> {
  return queryOne(
    "SELECT * FROM refresh_tokens WHERE token_hash = $1",
    [tokenHash]
  );
}

export async function revokeRefreshToken(id: string): Promise<void> {
  await query("UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1", [id]);
}

export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId]
  );
}

export async function createEmailVerificationToken(data: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [data.userId, data.tokenHash, data.expiresAt]
  );
}

export async function findEmailVerificationToken(tokenHash: string): Promise<{
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
} | null> {
  return queryOne(
    "SELECT * FROM email_verification_tokens WHERE token_hash = $1",
    [tokenHash]
  );
}

export async function markEmailVerificationTokenUsed(id: string): Promise<void> {
  await query("UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1", [id]);
}

export async function createPasswordResetOtp(data: {
  userId: string;
  otpHash: string;
  expiresAt: Date;
}): Promise<void> {
  await query(
    `INSERT INTO password_reset_otps (user_id, otp_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [data.userId, data.otpHash, data.expiresAt]
  );
}

export async function invalidatePreviousOtps(userId: string): Promise<void> {
  await query(
    `UPDATE password_reset_otps SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
}

export async function findLatestUnusedOtp(userId: string): Promise<{
  id: string;
  user_id: string;
  otp_hash: string;
  expires_at: Date;
  used_at: Date | null;
  attempt_count: number;
} | null> {
  return queryOne(
    `SELECT * FROM password_reset_otps
     WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
}

export async function incrementOtpAttempt(id: string): Promise<void> {
  await query(
    "UPDATE password_reset_otps SET attempt_count = attempt_count + 1 WHERE id = $1",
    [id]
  );
}

export async function markOtpUsed(id: string): Promise<void> {
  await query("UPDATE password_reset_otps SET used_at = NOW() WHERE id = $1", [id]);
}

export async function getPublicUserProfile(userId: string) {
  return queryOne(
    `SELECT id, email, name, email_verified, college, degree, graduation_year,
            career_goals, work_preferences, target_companies, skill_level,
            onboarding_step, onboarding_completed, subscription_tier, role,
            created_at, updated_at
     FROM users WHERE id = $1`,
    [userId]
  );
}
