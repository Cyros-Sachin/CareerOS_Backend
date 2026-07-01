import "dotenv/config";
import { createResumeParsingWorker, createJobIngestionWorker, jobIngestionQueue, createBillingExpiryWorker, billingExpiryQueue } from "./jobs/queue";
import { processResumeParsing } from "./jobs/resume-parsing.job";
import { processIngestion } from "./modules/jobs/ingestion/ingestion.worker";
import { processExpiryCheck } from "./modules/billing/expiry.worker";
import { connectRedis, redis } from "./lib/redis";
import { pool } from "./db/pool";
import { runMigrations } from "./db/migrate";
import { logger } from "./lib/logger";
import { env } from "./config/env";

async function main() {
  logger.info("Starting CareerOS worker...");

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

  const resumeWorker = createResumeParsingWorker(async (job) => {
    await processResumeParsing(job);
  });
  logger.info("Resume parsing worker listening for jobs");

  const ingestionWorker = createJobIngestionWorker(async (job) => {
    await processIngestion(job);
  });
  logger.info("Job ingestion worker listening for jobs");

  await jobIngestionQueue.upsertJobScheduler(
    "job-ingestion-scheduler",
    { pattern: env.JOBS_INGESTION_CRON },
    { name: "nightly-ingestion", data: {} }
  );
  logger.info({ cron: env.JOBS_INGESTION_CRON }, "Job ingestion scheduler registered");

  const expiryWorker = createBillingExpiryWorker(async (job) => {
    await processExpiryCheck(job);
  });
  logger.info("Billing expiry worker listening for jobs");

  await billingExpiryQueue.upsertJobScheduler(
    "billing-expiry-scheduler",
    { pattern: env.BILLING_EXPIRY_CRON },
    { name: "daily-expiry-check", data: {} }
  );
  logger.info({ cron: env.BILLING_EXPIRY_CRON }, "Billing expiry scheduler registered");

  process.on("SIGTERM", async () => {
    logger.info("Shutting down worker...");
    await resumeWorker.close();
    await ingestionWorker.close();
    await expiryWorker.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("Shutting down worker...");
    await resumeWorker.close();
    await ingestionWorker.close();
    await expiryWorker.close();
    await redis.quit();
    await pool.end();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal worker startup error");
  process.exit(1);
});
