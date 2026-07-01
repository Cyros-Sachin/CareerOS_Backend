import { describe, it, expect } from "vitest";

function normalizeCosineSimilarity(rawSimilarity: number): number {
  if (rawSimilarity == null) return 0;
  const clamped = Math.max(-1, Math.min(1, rawSimilarity));
  return Math.round(((clamped + 1) / 2) * 100);
}

function computeManualMatch(
  jobSkills: Array<{ skillName: string; importance: string }>,
  userSkills: string[]
): { matchPercent: number; missingSkills: Array<{ skillName: string; importance: string }>; matchedSkills: string[] } {
  const userSkillLower = userSkills.map((s) => s.toLowerCase());
  const missingSkills: Array<{ skillName: string; importance: string }> = [];
  const matchedSkills: string[] = [];

  for (const js of jobSkills) {
    if (userSkillLower.includes(js.skillName.toLowerCase())) {
      matchedSkills.push(js.skillName);
    } else {
      missingSkills.push(js);
    }
  }

  const totalSkills = jobSkills.length;
  const matchPercent = totalSkills > 0
    ? Math.round((matchedSkills.length / totalSkills) * 100)
    : 0;

  return { matchPercent, missingSkills, matchedSkills };
}

describe("Matching — Unit Tests", () => {
  describe("Cosine Similarity Normalization", () => {
    it("should normalize cosine distance to 0-100 match percent", () => {
      expect(normalizeCosineSimilarity(1.0)).toBe(100);
      expect(normalizeCosineSimilarity(0.0)).toBe(50);
      expect(normalizeCosineSimilarity(-1.0)).toBe(0);
    });

    it("should clamp values outside [-1, 1]", () => {
      expect(normalizeCosineSimilarity(1.5)).toBe(100);
      expect(normalizeCosineSimilarity(-2.0)).toBe(0);
    });

    it("should return 0 for null/undefined", () => {
      expect(normalizeCosineSimilarity(null as any)).toBe(0);
      expect(normalizeCosineSimilarity(undefined as any)).toBe(0);
    });

    it("should handle common cosine similarity values", () => {
      expect(normalizeCosineSimilarity(0.8)).toBe(90);
      expect(normalizeCosineSimilarity(0.5)).toBe(75);
      expect(normalizeCosineSimilarity(-0.5)).toBe(25);
    });
  });

  describe("Manual Match Computation", () => {
    const userSkills = ["JavaScript", "TypeScript", "React", "Node.js", "Python"];

    it("should calculate match percent from skill overlap", () => {
      const jobSkills = [
        { skillName: "JavaScript", importance: "required" as const },
        { skillName: "React", importance: "required" as const },
        { skillName: "Docker", importance: "preferred" as const },
      ];

      const result = computeManualMatch(jobSkills, userSkills);
      expect(result.matchPercent).toBe(67);
      expect(result.matchedSkills).toEqual(["JavaScript", "React"]);
      expect(result.missingSkills).toHaveLength(1);
      expect(result.missingSkills[0].skillName).toBe("Docker");
    });

    it("should return 0% when no skills match", () => {
      const jobSkills = [
        { skillName: "Docker", importance: "required" as const },
        { skillName: "Kubernetes", importance: "required" as const },
      ];

      const result = computeManualMatch(jobSkills, userSkills);
      expect(result.matchPercent).toBe(0);
      expect(result.matchedSkills).toHaveLength(0);
      expect(result.missingSkills).toHaveLength(2);
    });

    it("should return 100% when all skills match", () => {
      const jobSkills = [
        { skillName: "JavaScript", importance: "required" as const },
        { skillName: "Python", importance: "preferred" as const },
      ];

      const result = computeManualMatch(jobSkills, userSkills);
      expect(result.matchPercent).toBe(100);
      expect(result.matchedSkills).toHaveLength(2);
      expect(result.missingSkills).toHaveLength(0);
    });

    it("should handle case-insensitive matching", () => {
      const jobSkills = [
        { skillName: "javascript", importance: "required" as const },
        { skillName: "REACT", importance: "required" as const },
      ];

      const result = computeManualMatch(jobSkills, userSkills);
      expect(result.matchPercent).toBe(100);
    });

    it("should return 0% for empty job skills", () => {
      const result = computeManualMatch([], userSkills);
      expect(result.matchPercent).toBe(0);
      expect(result.matchedSkills).toHaveLength(0);
    });
  });
});
