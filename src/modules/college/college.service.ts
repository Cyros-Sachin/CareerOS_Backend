import { HttpError } from "../../middleware/errorHandler";
import { logger } from "../../lib/logger";
import * as repo from "./college.repository";
import { InstitutionMatchingService } from "./institution-matching.service";

export class CollegeService {
  constructor(private institutionMatching: InstitutionMatchingService) {}

  async createBatch(userId: string, data: { degree: string; graduationYear: number; label?: string }) {
    const user = await repo.getUserInstitutionInfo(userId);
    if (!user?.institution_id) {
      throw new HttpError(400, "NO_INSTITUTION", "You are not linked to any institution");
    }

    const batch = await repo.createBatch({
      institutionId: user.institution_id,
      degree: data.degree,
      graduationYear: data.graduationYear,
      label: data.label,
    });

    await repo.backfillBatchId({
      batchId: batch.id,
      institutionId: user.institution_id,
      degree: data.degree,
      graduationYear: data.graduationYear,
    });

    logger.info(
      { batchId: batch.id, institutionId: user.institution_id, degree: data.degree },
      "Batch created with backfill"
    );

    return batch;
  }

  async listBatches(userId: string) {
    const user = await repo.getUserInstitutionInfo(userId);
    if (!user?.institution_id) {
      throw new HttpError(400, "NO_INSTITUTION", "You are not linked to any institution");
    }
    return repo.getBatchesByInstitution(user.institution_id);
  }

  async getBatchAnalytics(batchId: string, userId: string) {
    const batch = await repo.findBatchById(batchId);
    if (!batch) {
      throw new HttpError(404, "BATCH_NOT_FOUND", "Batch not found");
    }

    const admin = await repo.getUserInstitutionInfo(userId);
    if (!admin?.institution_id || admin.institution_id !== batch.institution_id) {
      throw new HttpError(403, "FORBIDDEN", "You do not have access to this batch");
    }

    const institution = await repo.findInstitutionById(batch.institution_id);

    const [headcount, onboardingPct, resumeAnalytics, roadmapPct, interviewAnalytics, jobAnalytics] =
      await Promise.all([
        repo.getBatchHeadcount(batchId),
        repo.getOnboardingCompletionRate(batchId),
        repo.getResumeAnalytics(batchId),
        repo.getRoadmapAnalytics(batchId),
        repo.getInterviewAnalytics(batchId),
        repo.getJobApplicationAnalytics(batchId),
      ]);

    return {
      batchId: batch.id,
      label: batch.label,
      institutionName: institution?.name || null,
      degree: batch.degree,
      graduationYear: batch.graduation_year,
      headcount,
      onboarding: { completionRatePct: Math.round(onboardingPct) },
      resume: {
        uploadRatePct: resumeAnalytics.upload_rate_pct,
        avgAtsScore: resumeAnalytics.avg_ats_score,
        avgDimensionScores: resumeAnalytics.dimension_scores,
      },
      roadmap: { avgCompletionPct: roadmapPct },
      interviews: {
        sessionsCompleted: interviewAnalytics.sessions_completed,
        avgTotalScore: interviewAnalytics.avg_total_score,
      },
      jobs: jobAnalytics,
      topMissingSkills: [],
    };
  }

  async getBatchStudents(batchId: string, userId: string, limit: number) {
    const batch = await repo.findBatchById(batchId);
    if (!batch) {
      throw new HttpError(404, "BATCH_NOT_FOUND", "Batch not found");
    }

    const admin = await repo.getUserInstitutionInfo(userId);
    if (!admin?.institution_id || admin.institution_id !== batch.institution_id) {
      throw new HttpError(403, "FORBIDDEN", "You do not have access to this batch");
    }

    return repo.getConsentingStudents(batchId, limit);
  }

  async setConsent(userId: string, consent: boolean) {
    await repo.setDataSharingConsent(userId, consent);
    logger.info({ userId, consent }, "Data sharing consent updated");
    return { consent };
  }

  async getMyInstitution(userId: string) {
    const result = await repo.getUserInstitution(userId);
    if (!result) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }
    return result;
  }
}
