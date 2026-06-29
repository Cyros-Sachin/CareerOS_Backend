import "dotenv/config";
import { createResumeParsingWorker } from "./jobs/queue";
import { processResumeParsing } from "./jobs/resume-parsing.job";
import { connectRedis, redis } from "./lib/redis";
import { pool } from "./db/pool";
import { runMigrations } from "./db/migrate";
import { logger } from "./lib/logger";

async function main() {
  logger.info("Starting CareerOS resume worker...");

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

  const worker = createResumeParsingWorker(async (job) => {
    await processResumeParsing(job);
  });

  logger.info("Resume parsing worker listening for jobs");

  process.on("SIGTERM", async () => {
    logger.info("Shutting down worker...");
    await worker.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("Shutting down worker...");
    await worker.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal worker startup error");
  process.exit(1);
});
