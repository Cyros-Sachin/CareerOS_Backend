import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: Number(process.env.PORT || 5000),

  databaseUrl: process.env.DATABASE_URL!,

  jwtSecret: process.env.JWT_SECRET!,

  accessTokenExpiry:
    process.env.JWT_ACCESS_EXPIRES || "15m",

  refreshTokenExpiry:
    process.env.JWT_REFRESH_EXPIRES || "7d",

  redisUrl: process.env.REDIS_URL!,

  openAiKey: process.env.OPENAI_API_KEY!,
};