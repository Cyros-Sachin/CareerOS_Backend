import { Job } from "bullmq";
import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";
import { createEmbeddingService, createJobExtractionService } from "../../../lib/ai";
import * as jobsRepo from "../jobs.repository";
import { fetchIndeedJobs, type IndeedJobListing } from "./indeed.connector";
import { fetchWellfoundJobs, type WellfoundJobListing } from "./wellfound.connector";

type JobListing = IndeedJobListing | WellfoundJobListing;

export async function processIngestion(job: Job): Promise<void> {
  const startedAt = new Date().toISOString();
  logger.info({ attempt: job.attemptsMade }, "Starting job ingestion pipeline");

  let totalIngested = 0;
  let totalFailed = 0;

  const extractionService = createJobExtractionService();
  const embeddingService = createEmbeddingService();

  try {
    const indeedListings: JobListing[] = await fetchIndeedJobs(
      env.INDEED_PUBLISHER_ID || "",
      "software engineer",
      "",
      25
    );
    logger.info({ count: indeedListings.length }, "Indeed listings fetched");

    for (const listing of indeedListings) {
      try {
        await processSingleListing(listing, extractionService, embeddingService);
        totalIngested++;
      } catch (err) {
        totalFailed++;
        logger.error({ err, externalId: listing.externalId }, "Failed to process Indeed listing");
      }
    }

    const wellfoundListings: JobListing[] = await fetchWellfoundJobs(
      env.WELLFOUND_API_KEY || "",
      "software engineer",
      25
    );
    logger.info({ count: wellfoundListings.length }, "Wellfound listings fetched");

    for (const listing of wellfoundListings) {
      try {
        await processSingleListing(listing, extractionService, embeddingService);
        totalIngested++;
      } catch (err) {
        totalFailed++;
        logger.error({ err, externalId: listing.externalId }, "Failed to process Wellfound listing");
      }
    }

    await jobsRepo.deactivateStaleJobs(startedAt);

    logger.info(
      { totalIngested, totalFailed },
      "Job ingestion pipeline complete"
    );
  } catch (err) {
    logger.error({ err }, "Ingestion pipeline failed");
    throw err;
  }
}

async function processSingleListing(
  listing: JobListing,
  extractionService: ReturnType<typeof createJobExtractionService>,
  embeddingService: ReturnType<typeof createEmbeddingService>
): Promise<void> {
  const inserted = await jobsRepo.upsertJob({
    source: listing.source,
    externalId: listing.externalId,
    title: listing.title,
    company: listing.company,
    companyType: listing.companyType,
    location: listing.location,
    description: listing.description,
    applyUrl: listing.applyUrl,
    postedAt: listing.postedAt,
  });

  const extracted = await extractionService.extractSkills(listing.description);

  for (const skill of extracted.skills) {
    const matched = await matchSkillToDb(skill.skillName);
    if (matched) {
      await jobsRepo.upsertJobSkill({
        jobId: inserted.id,
        skillId: matched.id,
        importance: skill.importance,
      });
    }
  }

  const embeddingVector = await embeddingService.generateEmbedding(listing.description);
  await jobsRepo.updateJobEmbedding(inserted.id, embeddingVector);
}

async function matchSkillToDb(skillName: string): Promise<{ id: string; name: string } | null> {
  const exactMatch = await jobsRepo.findSkillByName(skillName);
  if (exactMatch) return exactMatch;

  const similar = await jobsRepo.findSkillsBySimilarName(skillName);
  if (similar.length > 0) return similar[0];

  return null;
}
