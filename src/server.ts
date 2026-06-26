import "dotenv/config";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { connectRedis } from "./lib/redis";
import { runMigrations } from "./db/migrate";
import { pool } from "./db/pool";
async function main() {
  logger.info("Starting CareerOS backend...");

  try {
    await pool.connect();
    logger.info("Database connected");
  } catch (err) {
    logger.fatal({ err }, "Failed to connect to database");
    process.exit(1);
  }

  try {
    await runMigrations();
  } catch (err) {
    logger.fatal({ err }, "Migration failed");
    process.exit(1);
  }

  await connectRedis();

  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, `Server listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal startup error");
  process.exit(1);
});
