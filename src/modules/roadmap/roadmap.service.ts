import { HttpError } from "../../middleware/errorHandler";
import { logger } from "../../lib/logger";
import * as repo from "./roadmap.repository";
import { GapAnalysisService } from "../gap-analysis/gap.service";
import { RoadmapGeneratorService } from "../../lib/ai/roadmap-generator.interface";
import * as userRepo from "../auth/auth.repository";
import { env } from "../../config/env";

export class RoadmapService {
  constructor(
    private gapService: GapAnalysisService,
    private roadmapGenerator: RoadmapGeneratorService
  ) {}

  async generate(userId: string, targetRole: string, hoursPerWeek: number) {
    const user = await userRepo.findById(userId);
    if (!user) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }

    const gapResult = await this.gapService.analyze(userId, targetRole);

    const totalEstHours = gapResult.missingSkills.reduce(
      (sum, s) => sum + (s.estLearningHours ?? 40),
      0
    );
    const maxMonths = Math.min(
      Math.max(1, Math.ceil(totalEstHours / (hoursPerWeek * 4))),
      env.ROADMAP_MAX_MONTHS
    );

    const roadmapPlan = await this.roadmapGenerator.generateRoadmap({
      targetRole,
      currentSkillLevel: user.skill_level ?? "beginner",
      hoursPerWeek,
      maxMonths,
      currentSkills: gapResult.currentSkills,
      missingSkills: gapResult.missingSkills.map((s) => ({
        skillName: s.skillName,
        importanceWeight: s.importanceWeight,
        estLearningHours: s.estLearningHours,
      })),
    });

    await repo.markSuperseded(userId, targetRole);

    const roadmap = await repo.createRoadmap({
      userId,
      targetRole,
      hoursPerWeek,
      skillLevel: user.skill_level ?? "beginner",
    });

    if (roadmapPlan.items.length > 0) {
      await repo.insertRoadmapItems(
        roadmapPlan.items.map((item) => ({
          roadmapId: roadmap.id,
          monthNumber: item.monthNumber,
          topic: item.topic,
          skillId: null,
          resources: item.resources,
          projectAssignment: item.projectAssignment,
          estimatedHours: item.estimatedHours,
        }))
      );
    }

    const items = await repo.getRoadmapItems(roadmap.id);

    logger.info(
      { userId, targetRole, roadmapId: roadmap.id, itemCount: items.length },
      "Roadmap generated"
    );

    return {
      ...roadmap,
      items,
      gapAnalysis: {
        matchPercent: gapResult.matchPercent,
        missingSkills: gapResult.missingSkills,
      },
    };
  }

  async getActive(userId: string, targetRole?: string) {
    const roadmap = await repo.findActiveRoadmap(userId, targetRole);
    if (!roadmap) {
      throw new HttpError(404, "ROADMAP_NOT_FOUND", "No active roadmap found");
    }
    const items = await repo.getRoadmapItems(roadmap.id);
    return { ...roadmap, items };
  }

  async getDetail(roadmapId: string, userId: string) {
    const roadmap = await repo.findById(roadmapId);
    if (!roadmap) {
      throw new HttpError(404, "ROADMAP_NOT_FOUND", "Roadmap not found");
    }
    if (roadmap.user_id !== userId) {
      throw new HttpError(403, "FORBIDDEN", "You don't own this roadmap");
    }
    const items = await repo.getRoadmapItems(roadmapId);
    return { ...roadmap, items };
  }

  async toggleItemCompletion(itemId: string, userId: string, isComplete: boolean) {
    const item = await repo.findItemById(itemId);
    if (!item) {
      throw new HttpError(404, "ITEM_NOT_FOUND", "Roadmap item not found");
    }

    const roadmap = await repo.findById(item.roadmap_id);
    if (!roadmap || roadmap.user_id !== userId) {
      throw new HttpError(403, "FORBIDDEN", "You don't own this roadmap");
    }

    return repo.updateItemCompletion(itemId, isComplete);
  }

  async regenerate(roadmapId: string, userId: string, hoursPerWeek?: number) {
    const roadmap = await repo.findById(roadmapId);
    if (!roadmap) {
      throw new HttpError(404, "ROADMAP_NOT_FOUND", "Roadmap not found");
    }
    if (roadmap.user_id !== userId) {
      throw new HttpError(403, "FORBIDDEN", "You don't own this roadmap");
    }

    return this.generate(
      userId,
      roadmap.target_role,
      hoursPerWeek ?? roadmap.hours_per_week
    );
  }
}
