import { createHash } from "crypto";
import { HttpError } from "../../middleware/errorHandler";
import { logger } from "../../lib/logger";
import { redis } from "../../lib/redis";
import { env } from "../../config/env";
import * as repo from "./jobs.repository";
import * as resumeRepo from "../resume/resume.repository";
import type { JobExtractionService, TailoredResumeContent } from "../../lib/ai/job-extraction.interface";
import type { InterviewAIService } from "../../lib/ai/interview-question-gen.interface";
import { buildTailoringPrompt, tailoredResumeSchema } from "../../lib/ai/resume-tailoring";
import { computeMatches, computeManualMatch } from "./matching.service";

export class JobsService {
  constructor(
    private jobExtraction: JobExtractionService,
    private interviewAI: InterviewAIService
  ) {}

  async getMatches(
    userId: string,
    filters: { location?: string; companyType?: string; limit: number }
  ) {
    const resume = await resumeRepo.getActiveResume(userId);
    if (!resume) {
      throw new HttpError(403, "NO_ACTIVE_RESUME", "Upload a resume and achieve a score of 70+ to see job matches");
    }
    if (!resume.ats_score || resume.ats_score < 70) {
      throw new HttpError(
        403,
        "SCORE_TOO_LOW",
        `Your resume score (${resume.ats_score || 0}) needs to be at least 70 to access job matches. Improve your resume and try again.`
      );
    }
    if (!resume.profile_embedding) {
      throw new HttpError(400, "NO_PROFILE_EMBEDDING", "Your profile embedding hasn't been computed yet. Please re-activate your resume.");
    }

    const cacheKey = buildMatchesCacheKey(userId, filters);
    if (redis.status === "ready") {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug({ userId }, "Returning cached job matches");
        return JSON.parse(cached);
      }
    }

    const userSkills = await repo.getUserSkills(userId);

    const results = await computeMatches({
      profileEmbedding: resume.profile_embedding as number[],
      location: filters.location,
      companyType: filters.companyType,
      limit: filters.limit,
      userSkills,
    });

    if (redis.status === "ready") {
      await redis.setex(cacheKey, env.MATCHES_CACHE_TTL_SECONDS, JSON.stringify(results));
    }

    return results;
  }

  async getJobDetail(jobId: string, userId: string) {
    const job = await repo.findJobById(jobId);
    if (!job) {
      throw new HttpError(404, "JOB_NOT_FOUND", "Job not found");
    }

    const userSkills = await repo.getUserSkills(userId);
    const jobSkills = await repo.getJobSkillsWithNames(jobId);

    const userSkillLower = userSkills.map((s) => s.toLowerCase());
    const missingSkills = jobSkills.filter(
      (js) => !userSkillLower.includes(js.skillName.toLowerCase())
    );

    return {
      ...job,
      jobSkills,
      missingSkills,
    };
  }

  async submitManualJob(userId: string, data: { jobUrl?: string; jobText: string }) {
    const extracted = await this.jobExtraction.extractSkills(data.jobText);

    const userSkills = await repo.getUserSkills(userId);
    const result = await computeManualMatch({
      jobSkills: extracted.skills,
      userSkills,
    });

    return {
      jobText: data.jobText.substring(0, 500),
      jobUrl: data.jobUrl || null,
      extractedSkills: extracted.skills,
      matchPercent: result.matchPercent,
      matchedSkills: result.matchedSkills,
      missingSkills: result.missingSkills,
    };
  }

  async tailorResume(jobId: string, userId: string) {
    const resume = await resumeRepo.getActiveResume(userId);
    if (!resume) {
      throw new HttpError(403, "NO_ACTIVE_RESUME", "No active resume found");
    }
    if (!resume.ats_score || resume.ats_score < 70) {
      throw new HttpError(403, "SCORE_TOO_LOW", "Resume score must be at least 70 to tailor for a job");
    }

    const job = await repo.findJobById(jobId);
    if (!job) {
      throw new HttpError(404, "JOB_NOT_FOUND", "Job not found");
    }

    const jobSkills = await repo.getJobSkillsWithNames(jobId);

    const prompt = buildTailoringPrompt({
      parsedData: (resume.parsed_data || {}) as Record<string, unknown>,
      jobTitle: job.title,
      jobCompany: job.company,
      jobDescription: job.description,
      jobSkills,
    });

    const evaluation = await this.interviewAI.evaluateAnswer({
      questionText: prompt,
      answerText: "Generate tailored resume based on the instructions above.",
      mode: "hr",
    });

    let tailoredContent: TailoredResumeContent;
    try {
      tailoredContent = tailoredResumeSchema.parse(JSON.parse(evaluation.modelAnswer));
    } catch {
      tailoredContent = resume.parsed_data as unknown as TailoredResumeContent;
    }

    const tailored = await repo.createTailoredResume({
      userId,
      sourceResumeId: resume.id,
      jobId,
      tailoredContent: tailoredContent as unknown as Record<string, unknown>,
    });

    return {
      id: tailored.id,
      jobId: tailored.job_id,
      sourceResumeId: tailored.source_resume_id,
      tailoredContent: tailored.tailored_content,
      createdAt: tailored.created_at,
    };
  }

  async getTailoredResume(tailoredResumeId: string, userId: string) {
    const tailored = await repo.findTailoredResumeById(tailoredResumeId);
    if (!tailored) {
      throw new HttpError(404, "TAILORED_RESUME_NOT_FOUND", "Tailored resume not found");
    }
    if (tailored.user_id !== userId) {
      throw new HttpError(403, "FORBIDDEN", "You don't own this tailored resume");
    }
    return tailored;
  }

  async applyToJob(jobId: string, userId: string, notes?: string) {
    const job = await repo.findJobById(jobId);
    if (!job) {
      throw new HttpError(404, "JOB_NOT_FOUND", "Job not found");
    }

    const application = await repo.createApplication({ userId, jobId, notes });

    logger.info({ userId, jobId }, "User applied to job");

    return {
      id: application.id,
      jobId: application.job_id,
      status: application.status,
      appliedAt: application.applied_at,
    };
  }

  async updateApplication(applicationId: string, userId: string, data: { status?: string; notes?: string }) {
    const app = await repo.findApplicationById(applicationId);
    if (!app) {
      throw new HttpError(404, "APPLICATION_NOT_FOUND", "Application not found");
    }
    if (app.user_id !== userId) {
      throw new HttpError(403, "FORBIDDEN", "You don't own this application");
    }

    const updated = await repo.updateApplication(applicationId, data);
    if (!updated) {
      throw new HttpError(400, "NO_CHANGES", "No changes provided");
    }

    logger.info({ applicationId, status: updated.status }, "Application status updated");

    return updated;
  }

  async getApplications(userId: string, status?: string) {
    return repo.getUserApplications(userId, status);
  }
}

function buildMatchesCacheKey(userId: string, filters: { location?: string; companyType?: string; limit: number }): string {
  const hash = createHash("sha256")
    .update(JSON.stringify({ location: filters.location, companyType: filters.companyType, limit: filters.limit }))
    .digest("hex")
    .substring(0, 16);
  return `jobs:matches:${userId}:${hash}`;
}
