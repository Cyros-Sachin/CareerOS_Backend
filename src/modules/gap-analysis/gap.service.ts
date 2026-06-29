import * as repo from "./gap.repository";
import { getActiveResume } from "../resume/resume.repository";
import { EmbeddingService } from "../../lib/ai/embeddings.interface";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";

export interface MissingSkill {
  skillId: string;
  skillName: string;
  category: string;
  importanceWeight: number;
  minProficiency: string;
  estLearningHours: number | null;
}

export interface GapAnalysisResult {
  currentSkills: string[];
  missingSkills: MissingSkill[];
  matchPercent: number;
}

export class GapAnalysisService {
  constructor(private embeddingService?: EmbeddingService) {}

  async analyze(userId: string, targetRole: string): Promise<GapAnalysisResult> {
    const userResume = await getActiveResume(userId);
    const parsedData = userResume?.parsed_data as { skills?: string[] } | null;
    const userSkills = parsedData?.skills ?? [];

    if (userSkills.length === 0) {
      const requirements = await repo.getRoleRequirements(targetRole);
      return {
        currentSkills: [],
        missingSkills: requirements.map((r) => ({
          skillId: r.skill_id,
          skillName: r.skill_name,
          category: r.skill_category,
          importanceWeight: r.importance_weight,
          minProficiency: r.min_proficiency,
          estLearningHours: r.est_learning_hours,
        })),
        matchPercent: 0,
      };
    }

    const requirements = await repo.getRoleRequirements(targetRole);
    if (requirements.length === 0) {
      return {
        currentSkills: userSkills,
        missingSkills: [],
        matchPercent: 100,
      };
    }

    const matchedSkillIds = new Set<string>();

    for (const userSkill of userSkills) {
      const exactMatch = await repo.findSkillByNameOrAlias(userSkill);
      if (exactMatch) {
        matchedSkillIds.add(exactMatch.id);
      }
    }

    if (this.embeddingService && env.GAP_SEMANTIC_MATCH_THRESHOLD > 0) {
      const unmatchedUserSkills: string[] = [];
      for (const s of userSkills) {
        const match = await repo.findSkillByNameOrAlias(s);
        if (!match) {
          unmatchedUserSkills.push(s);
        }
      }

      if (unmatchedUserSkills.length > 0) {
        try {
          const embeddings = await this.embeddingService.generateEmbeddings(unmatchedUserSkills);

          for (let i = 0; i < embeddings.length; i++) {
            const similar = await repo.findSimilarSkills(
              embeddings[i],
              env.GAP_SEMANTIC_MATCH_THRESHOLD
            );
            for (const s of similar) {
              matchedSkillIds.add(s.id);
            }
          }
        } catch (err) {
          logger.warn({ err }, "Semantic matching failed, falling back to exact match only");
        }
      }
    }

    const missingSkills: MissingSkill[] = [];
    for (const req of requirements) {
      if (!matchedSkillIds.has(req.skill_id)) {
        missingSkills.push({
          skillId: req.skill_id,
          skillName: req.skill_name,
          category: req.skill_category,
          importanceWeight: req.importance_weight,
          minProficiency: req.min_proficiency,
          estLearningHours: req.est_learning_hours,
        });
      }
    }

    missingSkills.sort((a, b) => {
      if (b.importanceWeight !== a.importanceWeight) {
        return b.importanceWeight - a.importanceWeight;
      }
      return (a.estLearningHours ?? 999) - (b.estLearningHours ?? 999);
    });

    const matchPercent = Math.round(
      ((requirements.length - missingSkills.length) / requirements.length) * 100
    );

    return {
      currentSkills: userSkills,
      missingSkills,
      matchPercent,
    };
  }
}
