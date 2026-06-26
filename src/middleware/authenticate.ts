import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, JwtPayload } from "../lib/jwt";

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header" } });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = { userId: payload.userId, email: payload.email, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: { code: "TOKEN_EXPIRED", message: "Access token expired or invalid" } });
  }
}
