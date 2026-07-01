import { logger } from "../../lib/logger";
import * as resumeRepo from "../resume/resume.repository";

interface DimensionScoreEntry {
  raw: number;
  weight: number;
  weighted: number;
}

export async function syncInterviewReadiness(
  userId: string,
  compositeScore: number
): Promise<void> {
  const activeResume = await resumeRepo.getActiveResume(userId);
  if (!activeResume) {
    logger.info(
      { userId, compositeScore },
      "No active resume found — skipping Interview Readiness sync"
    );
    return;
  }

  const dimensionScores = (activeResume.dimension_scores || {}) as Record<string, DimensionScoreEntry>;

  dimensionScores.interview = {
    raw: compositeScore,
    weight: 0.10,
    weighted: Math.round(compositeScore * 0.10 * 100) / 100,
  };

  const recomputedAts = recomputeAtsFromDimensions(dimensionScores);

  await resumeRepo.saveScoredData(
    activeResume.id,
    (activeResume.parsed_data || {}) as Record<string, unknown>,
    { atsScore: recomputedAts, dimensionScores, suggestions: activeResume.suggestions || [] }
  );

  await resumeRepo.insertScoreHistory(activeResume.id, userId, {
    atsScore: recomputedAts,
    dimensionScores,
  });

  logger.info(
    { userId, resumeId: activeResume.id, compositeScore, atsScore: recomputedAts },
    "Interview Readiness synced to active resume"
  );
}

function recomputeAtsFromDimensions(dimensionScores: Record<string, DimensionScoreEntry>): number {
  const dims = ["quality", "ats", "projects", "experience", "interview", "market"];
  let total = 0;

  for (const dim of dims) {
    const entry = dimensionScores[dim];
    if (entry && typeof entry.raw === "number" && typeof entry.weight === "number") {
      total += entry.raw * entry.weight;
    }
  }

  return Math.min(100, Math.max(0, Math.round(total)));
}
