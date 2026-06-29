import { Job } from "bullmq";
import * as resumeRepo from "../modules/resume/resume.repository";
import { extractFromPdf } from "../lib/text-extraction/pdf-extractor";
import { extractFromDocx } from "../lib/text-extraction/docx-extractor";
import { resumeParser } from "../lib/ai";
import { computeAtsScore } from "../modules/resume/scoring.service";
import { getObjectBuffer } from "../lib/s3";
import { logger } from "../lib/logger";

interface ResumeParsingPayload {
  resumeId: string;
  userId: string;
  fileKey: string;
  mimeType: string;
  originalFilename: string;
}

const MAX_PAGES = parseInt(process.env.RESUME_MAX_PAGES || "3", 10);

export async function processResumeParsing(job: Job<ResumeParsingPayload>): Promise<void> {
  const { resumeId, userId, fileKey, mimeType, originalFilename } = job.data;

  logger.info({ resumeId, userId, attempt: job.attemptsMade }, "Processing resume parsing job");

  try {
    await resumeRepo.updateResumeStatus(resumeId, "processing");

    const fileBuffer = await getObjectBuffer(fileKey);

    let rawText: string;
    let pageCount: number;

    if (mimeType === "application/pdf") {
      const result = await extractFromPdf(fileBuffer);
      rawText = result.text;
      pageCount = result.pageCount;
    } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await extractFromDocx(fileBuffer);
      rawText = result.text;
      pageCount = result.pageCount;
    } else {
      throw new Error(`Unsupported mime type: ${mimeType}`);
    }

    if (pageCount > MAX_PAGES) {
      throw new Error(`Resume exceeds maximum page count (${pageCount} > ${MAX_PAGES}). Please upload a shorter resume.`);
    }

    logger.info({ resumeId, pageCount, textLength: rawText.length }, "Text extraction complete");

    await resumeRepo.saveExtractedText(resumeId, rawText, pageCount);
    await resumeRepo.updateResumeStatus(resumeId, "parsed");

    const parsed = await resumeParser.parseResume(rawText);

    const keywordCount = await resumeRepo.getRoleKeywordCountForUser(userId);
    const keywords = keywordCount > 0 ? await resumeRepo.getAllKeywords() : [];

    const scoringResult = computeAtsScore(parsed, keywords);

    await resumeRepo.saveScoredData(resumeId, parsed as unknown as Record<string, unknown>, scoringResult);
    await resumeRepo.insertScoreHistory(resumeId, userId, scoringResult);
    await resumeRepo.updateResumeStatus(resumeId, "scored");

    logger.info({ resumeId, atsScore: scoringResult.atsScore }, "Resume scoring complete");
  } catch (err: any) {
    logger.error({ err, resumeId, attempt: job.attemptsMade }, "Resume parsing job failed");

    await resumeRepo.updateResumeStatus(resumeId, "failed", err.message);

    throw err;
  }
}