import { Job } from "bullmq";
import { logger } from "../../lib/logger";
import * as repo from "./billing.repository";

export async function processExpiryCheck(_job: Job) {
  logger.info("Running subscription expiry check");

  const expired = await repo.findExpiredSubscriptions();

  for (const user of expired) {
    await repo.downgradeToFree(user.id);
    logger.info({ userId: user.id }, "Subscription expired — downgraded to free");
  }

  logger.info({ expiredCount: expired.length }, "Subscription expiry check complete");
}
