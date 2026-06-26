import crypto from "crypto";

export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export function generateRandomToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
