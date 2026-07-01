import { describe, it, expect } from "vitest";
import {
  computeWeightedComposite,
  findLowestDimensions,
  aggregateSessionScores,
  dimensionScoreSchema,
  answerEvaluationSchema,
} from "../src/lib/ai/interview-scoring";

describe("Interview Scoring — Unit Tests", () => {
  const sampleScores = {
    correctness_soundness: 85,
    complexity_tradeoff_awareness: 70,
    communication_clarity: 90,
    best_practices: 75,
    completeness: 80,
  };

  describe("computeWeightedComposite", () => {
    it("should compute a weighted composite score between 0-100", () => {
      const composite = computeWeightedComposite(sampleScores);
      expect(composite).toBeGreaterThanOrEqual(0);
      expect(composite).toBeLessThanOrEqual(100);
    });

    it("should return 100 for perfect scores", () => {
      const perfect = {
        correctness_soundness: 100,
        complexity_tradeoff_awareness: 100,
        communication_clarity: 100,
        best_practices: 100,
        completeness: 100,
      };
      expect(computeWeightedComposite(perfect)).toBe(100);
    });

    it("should return 0 for minimum scores", () => {
      const min = {
        correctness_soundness: 0,
        complexity_tradeoff_awareness: 0,
        communication_clarity: 0,
        best_practices: 0,
        completeness: 0,
      };
      expect(computeWeightedComposite(min)).toBe(0);
    });

    it("should weigh correctness_soundness highest (0.30)", () => {
      const highCorrectness = {
        correctness_soundness: 100,
        complexity_tradeoff_awareness: 0,
        communication_clarity: 0,
        best_practices: 0,
        completeness: 0,
      };
      const highCompleteness = {
        correctness_soundness: 0,
        complexity_tradeoff_awareness: 0,
        communication_clarity: 0,
        best_practices: 0,
        completeness: 100,
      };
      const c1 = computeWeightedComposite(highCorrectness);
      const c2 = computeWeightedComposite(highCompleteness);
      expect(c1).toBeGreaterThan(c2);
    });
  });

  describe("findLowestDimensions", () => {
    it("should return the lowest-scoring dimensions", () => {
      const lowest = findLowestDimensions(sampleScores, 2);
      expect(lowest).toHaveLength(2);
      expect(lowest[0].dimension).toBe("complexity_tradeoff_awareness");
      expect(lowest[1].dimension).toBe("best_practices");
    });

    it("should return all dimensions sorted ascending when count exceeds length", () => {
      const all = findLowestDimensions(sampleScores, 10);
      expect(all).toHaveLength(5);
      expect(all[0].score).toBeLessThanOrEqual(all[1].score);
    });
  });

  describe("aggregateSessionScores", () => {
    it("should aggregate multiple answer scores correctly", () => {
      const allScores = [
        {
          correctness_soundness: 80,
          complexity_tradeoff_awareness: 70,
          communication_clarity: 90,
          best_practices: 75,
          completeness: 85,
        },
        {
          correctness_soundness: 90,
          complexity_tradeoff_awareness: 80,
          communication_clarity: 85,
          best_practices: 80,
          completeness: 90,
        },
      ];

      const result = aggregateSessionScores(allScores);
      expect(result.averageScores.correctness_soundness).toBe(85);
      expect(result.averageScores.communication_clarity).toBe(88);
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
      expect(result.improvementAreas.length).toBe(2);
    });

    it("should handle a session with varied scores including low ones", () => {
      const allScores = [
        {
          correctness_soundness: 90,
          complexity_tradeoff_awareness: 85,
          communication_clarity: 88,
          best_practices: 92,
          completeness: 87,
        },
        {
          correctness_soundness: 82,
          complexity_tradeoff_awareness: 60,
          communication_clarity: 85,
          best_practices: 70,
          completeness: 80,
        },
        {
          correctness_soundness: 88,
          complexity_tradeoff_awareness: 75,
          communication_clarity: 90,
          best_practices: 78,
          completeness: 85,
        },
        {
          correctness_soundness: 75,
          complexity_tradeoff_awareness: 65,
          communication_clarity: 80,
          best_practices: 72,
          completeness: 78,
        },
        {
          correctness_soundness: 95,
          complexity_tradeoff_awareness: 90,
          communication_clarity: 92,
          best_practices: 88,
          completeness: 91,
        },
      ];

      const result = aggregateSessionScores(allScores);
      expect(result.improvementAreas[0].dimension).toBe("complexity_tradeoff_awareness");
      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
    });
  });

  describe("Zod Schema Validation", () => {
    it("should accept valid dimension scores", () => {
      const valid = dimensionScoreSchema.safeParse(sampleScores);
      expect(valid.success).toBe(true);
    });

    it("should reject scores outside 0-100 range", () => {
      const invalid = dimensionScoreSchema.safeParse({
        ...sampleScores,
        correctness_soundness: 150,
      });
      expect(invalid.success).toBe(false);
    });

    it("should reject negative scores", () => {
      const invalid = dimensionScoreSchema.safeParse({
        ...sampleScores,
        communication_clarity: -10,
      });
      expect(invalid.success).toBe(false);
    });

    it("should accept valid answer evaluation", () => {
      const valid = answerEvaluationSchema.safeParse({
        score: sampleScores,
        feedback: "Good answer. Consider discussing edge cases and optimizing for space complexity.",
        modelAnswer: "A comprehensive solution that handles all edge cases...",
      });
      expect(valid.success).toBe(true);
    });

    it("should reject evaluation with missing feedback", () => {
      const invalid = answerEvaluationSchema.safeParse({
        score: sampleScores,
        modelAnswer: "Some answer",
      });
      expect(invalid.success).toBe(false);
    });

    it("should reject evaluation with empty feedback", () => {
      const invalid = answerEvaluationSchema.safeParse({
        score: sampleScores,
        feedback: "",
        modelAnswer: "Some answer",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("Late answer handling", () => {
    it("should not exclude late-submitted answers from aggregation", () => {
      const allScores = [
        {
          correctness_soundness: 85,
          complexity_tradeoff_awareness: 70,
          communication_clarity: 90,
          best_practices: 75,
          completeness: 80,
        },
        {
          correctness_soundness: 60,
          complexity_tradeoff_awareness: 55,
          communication_clarity: 65,
          best_practices: 50,
          completeness: 60,
        },
      ];

      const result = aggregateSessionScores(allScores);
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.averageScores.correctness_soundness).toBe(73);
    });
  });
});
