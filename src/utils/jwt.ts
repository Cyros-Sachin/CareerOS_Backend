import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function generateAccessToken(
  payload: JwtPayload
) {
  return jwt.sign(
    payload,
    env.jwtSecret,
    {
      expiresIn: env.accessTokenExpiry as any,
    }
  );
}

export function generateRefreshToken(
  payload: JwtPayload
) {
  return jwt.sign(
    payload,
    env.jwtSecret,
    {
      expiresIn: env.refreshTokenExpiry as any,
    }
  );
}

export function verifyToken(
  token: string
) {
  return jwt.verify(
    token,
    env.jwtSecret
  ) as JwtPayload;
}