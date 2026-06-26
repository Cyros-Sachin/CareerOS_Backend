import { Request, Response, NextFunction } from "express";
import { redis } from "../lib/redis";

interface RateLimiterConfig {
  keyPrefix: string;
  windowSeconds: number;
  max: number;
  keyFn?: (req: Request) => string;
}

export function rateLimiter(config: RateLimiterConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!redis.status || redis.status !== "ready") {
      next();
      return;
    }

    const key = config.keyFn ? config.keyFn(req) : req.ip || "unknown";
    const redisKey = `ratelimit:${config.keyPrefix}:${key}`;

    try {
      const current = await redis.incr(redisKey);
      if (current === 1) {
        await redis.expire(redisKey, config.windowSeconds);
      }

      res.setHeader("X-RateLimit-Limit", config.max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, config.max - current));

      if (current > config.max) {
        res.status(429).json({
          error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" },
        });
        return;
      }

      next();
    } catch {
      next();
    }
  };
}

export const generalLimiter = rateLimiter({
  keyPrefix: "general",
  windowSeconds: 60,
  max: 100,
});
