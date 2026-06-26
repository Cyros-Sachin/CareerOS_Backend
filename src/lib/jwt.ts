import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
}

export function signRefreshToken(payload: { userId: string; tokenId: string }): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyRefreshToken(token: string): { userId: string; tokenId: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { userId: string; tokenId: string };
}
