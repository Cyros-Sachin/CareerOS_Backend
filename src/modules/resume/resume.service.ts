import crypto from "crypto";
import { resumeParsingQueue } from "../../jobs/queue";
import { getUploadUrl, buildResumeKey, getFileExtension } from "../../lib/s3";
import { HttpError } from "../../middleware/errorHandler";
import { logger } from "../../lib/logger";
import * as repo from "./resume.repository";
import { env } from "../../config/env";

export class ResumeService {
  async requestUploadUrl(
    userId: string,
    filename: string,
    mimeType: string,
    fileSizeBytes: number,
    subscriptionTier?: string
  ): Promise<{
    uploadUrl: string;
    resumeId: string;
    fileKey: string;
  }> {
    const ext = getFileExtension(mimeType);
    const resumeId = crypto.randomUUID();
    const fileKey = buildResumeKey(userId, resumeId, ext);

    const billingMonth = repo.getCurrentBillingMonth();

    if (subscriptionTier === "free" || !subscriptionTier) {
      const scanCount = await repo.countScansForMonth(userId, billingMonth);
      if (scanCount >= env.FREE_TIER_MONTHLY_SCAN_LIMIT) {
        throw new HttpError(
          403,
          "SCAN_LIMIT_REACHED",
          `You've used all ${env.FREE_TIER_MONTHLY_SCAN_LIMIT} free scans this month. Upgrade to continue.`
        );
      }
    }

    const uploadUrl = await getUploadUrl(fileKey, mimeType);

    const fileUrl = `https://${env.S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${fileKey}`;

    const resume = await repo.createResume({
      userId,
      fileUrl,
      fileKey,
      originalFilename: filename,
      fileSizeBytes,
      mimeType,
    });

    await repo.insertScanRecord(userId, resume.id, billingMonth);

    logger.info({ resumeId: resume.id, userId, fileSizeBytes, mimeType }, "Upload URL generated");

    return {
      uploadUrl,
      resumeId: resume.id,
      fileKey,
    };
  }

  async confirmUpload(resumeId: string, userId: string): Promise<void> {
    const resume = await repo.findById(resumeId);
    if (!resume) {
      throw new HttpError(404, "RESUME_NOT_FOUND", "Resume not found");
    }
    if (resume.user_id !== userId) {
      throw new HttpError(403, "FORBIDDEN", "You don't own this resume");
    }
    if (resume.status !== "uploaded") {
      throw new HttpError(400, "INVALID_STATUS", `Cannot confirm resume in status: ${resume.status}`);
    }

    await repo.updateResumeStatus(resumeId, "processing");

    await resumeParsingQueue.add("parse-resume", {
      resumeId,
      userId,
      fileKey: resume.file_key,
      mimeType: resume.mime_type,
      originalFilename: resume.original_filename,
    });

    logger.info({ resumeId, userId }, "Resume parsing job enqueued");
  }

  async getStatus(resumeId: string, userId: string): Promise<{
    status: string;
    failureReason: string | null;
  }> {
    const resume = await repo.findById(resumeId);
    if (!resume) {
      throw new HttpError(404, "RESUME_NOT_FOUND", "Resume not found");
    }
    if (resume.user_id !== userId) {
      throw new HttpError(403, "FORBIDDEN", "You don't own this resume");
    }

    return { status: resume.status, failureReason: resume.failure_reason };
  }

  async getResumeDetail(resumeId: string, userId: string) {
    const resume = await repo.findById(resumeId);
    if (!resume) {
      throw new HttpError(404, "RESUME_NOT_FOUND", "Resume not found");
    }
    if (resume.user_id !== userId) {
      throw new HttpError(403, "FORBIDDEN", "You don't own this resume");
    }

    return {
      id: resume.id,
      originalFilename: resume.original_filename,
      fileUrl: resume.file_url,
      status: resume.status,
      failureReason: resume.failure_reason,
      pageCount: resume.page_count,
      parsedData: resume.parsed_data,
      atsScore: resume.ats_score,
      dimensionScores: resume.dimension_scores,
      suggestions: resume.suggestions,
      isActive: resume.is_active,
      createdAt: resume.created_at,
      updatedAt: resume.updated_at,
    };
  }

  async getScore(resumeId: string, userId: string) {
    const resume = await repo.findById(resumeId);
    if (!resume) {
      throw new HttpError(404, "RESUME_NOT_FOUND", "Resume not found");
    }
    if (resume.user_id !== userId) {
      throw new HttpError(403, "FORBIDDEN", "You don't own this resume");
    }

    return {
      atsScore: resume.ats_score,
      dimensionScores: resume.dimension_scores,
      status: resume.status,
    };
  }

  async getHistory(userId: string, limit: number = 50) {
    return repo.getScoreHistory(userId, limit);
  }

  async listResumes(userId: string) {
    const resumes = await repo.findByUser(userId);
    return resumes.map((r) => ({
      id: r.id,
      originalFilename: r.original_filename,
      status: r.status,
      atsScore: r.ats_score,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async activateResume(resumeId: string, userId: string): Promise<void> {
    const resume = await repo.findById(resumeId);
    if (!resume) {
      throw new HttpError(404, "RESUME_NOT_FOUND", "Resume not found");
    }
    if (resume.user_id !== userId) {
      throw new HttpError(403, "FORBIDDEN", "You don't own this resume");
    }
    if (resume.status !== "scored") {
      throw new HttpError(400, "INVALID_STATUS", "Only scored resumes can be activated");
    }

    await repo.setActiveResume(resumeId, userId);
  }

  async deleteResume(resumeId: string, userId: string): Promise<void> {
    const deleted = await repo.deleteResume(resumeId, userId);
    if (!deleted) {
      throw new HttpError(404, "RESUME_NOT_FOUND", "Resume not found");
    }
    logger.info({ resumeId, userId, fileKey: deleted.file_key }, "Resume deleted");
  }
}
