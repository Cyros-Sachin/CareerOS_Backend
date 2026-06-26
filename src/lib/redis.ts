import Redis from "ioredis";
import { env } from "../config/env";
import { logger } from "./logger";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 5) return null;
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

redis.on("error", (err) => {
  logger.warn({ err }, "Redis connection error");
});

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    logger.info("Redis connected");
  } catch {
    logger.warn("Redis not available — rate limiting will be disabled");
  }
}

export async function redisPing(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}
