import { z } from "zod";
import type { AnswerEvaluationParams } from "./interview-question-gen.interface";

export const dimensionScoreSchema = z.object({
  correctness_soundness: z.number().int().min(0).max(100),
  complexity_tradeoff_awareness: z.number().int().min(0).max(100),
  communication_clarity: z.number().int().min(0).max(100),
  best_practices: z.number().int().min(0).max(100),
  completeness: z.number().int().min(0).max(100),
});

export type DimensionScores = z.infer<typeof dimensionScoreSchema>;

export const answerEvaluationSchema = z.object({
  score: dimensionScoreSchema,
  feedback: z.string().min(1),
  modelAnswer: z.string().min(1),
});

const DIMENSION_WEIGHTS = {
  correctness_soundness: 0.30,
  complexity_tradeoff_awareness: 0.20,
  communication_clarity: 0.20,
  best_practices: 0.15,
  completeness: 0.15,
};

export function computeWeightedComposite(scores: DimensionScores): number {
  let total = 0;
  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    total += scores[dim as keyof DimensionScores] * weight;
  }
  return Math.min(100, Math.max(0, Math.round(total)));
}

export function findLowestDimensions(scores: DimensionScores, count: number = 2): Array<{ dimension: string; score: number }> {
  return Object.entries(scores)
    .sort(([, a], [, b]) => a - b)
    .slice(0, count)
    .map(([dimension, score]) => ({ dimension, score }));
}

export function aggregateSessionScores(allScores: DimensionScores[]): {
  totalScore: number;
  averageScores: DimensionScores;
  improvementAreas: Array<{ dimension: string; score: number }>;
} {
  const dimensionKeys = Object.keys(DIMENSION_WEIGHTS) as (keyof DimensionScores)[];

  const averageScores = {} as DimensionScores;
  for (const dim of dimensionKeys) {
    const sum = allScores.reduce((acc, s) => acc + s[dim], 0);
    averageScores[dim] = Math.round(sum / allScores.length);
  }

  const totalScore = computeWeightedComposite(averageScores);
  const improvementAreas = findLowestDimensions(averageScores, 2);

  return { totalScore, averageScores, improvementAreas };
}

export function buildEvaluationPrompt(params: AnswerEvaluationParams): string {
  const modeEmphasis: Record<string, string> = {
    technical: `- Correctness/Soundness: Is the algorithm/code correct? Does it handle edge cases?
- Complexity/Trade-off Awareness: Does the answer discuss time/space complexity? Are trade-offs acknowledged?
- Communication Clarity: Is the approach explained clearly, not just code?
- Best Practices: Code style, naming conventions, structure.
- Completeness: Is the solution fully implemented?`,
    system_design: `- Correctness/Soundness: Does the design meet stated requirements?
- Complexity/Trade-off Awareness: Scalability considerations, trade-off reasoning, bottlenecks.
- Communication Clarity: Clarity of design rationale and component relationships.
- Best Practices: Standard patterns (caching, sharding, CDN, etc.) where relevant.
- Completeness: Are major system components covered?`,
    hr: `- Correctness/Soundness: Does the answer address the actual question asked?
- Complexity/Trade-off Awareness: Depth of self-reflection and situational analysis.
- Communication Clarity: Structure (e.g., STAR method), clarity of expression.
- Best Practices: Professionalism, specificity of examples, positivity.
- Completeness: Are all parts of a multi-part question fully answered?`,
  };

  return `You are an expert interview evaluator. Evaluate the following answer for a ${params.mode} interview question.

Question: "${params.questionText}"

Answer: "${params.answerText}"

${params.language ? `Language: ${params.language}\n` : ""}
Score the answer across these 5 dimensions (0-100):

${modeEmphasis[params.mode] || modeEmphasis.technical}

Return ONLY valid JSON matching this exact shape:
{
  "score": {
    "correctness_soundness": 85,
    "complexity_tradeoff_awareness": 70,
    "communication_clarity": 90,
    "best_practices": 75,
    "completeness": 80
  },
  "feedback": "2-4 sentences of actionable, specific feedback based on the dimensions above.",
  "modelAnswer": "A strong reference answer that would score highly across all dimensions."
}`;
}

export function buildQuestionGenPrompt(params: {
  mode: string;
  difficulty?: string;
  topic?: string;
  targetRole: string;
  skillLevel: string;
  language?: string;
}): string {
  const modeDescriptions: Record<string, string> = {
    technical: "Write technical/coding questions that test data structures, algorithms, and problem-solving ability. For technical mode, questions should be language-agnostic algorithmic prompts unless a specific language is given.",
    system_design: "Write system design questions that test architecture reasoning, scalability thinking, and trade-off analysis.",
    hr: "Write HR/behavioral questions that test communication, self-reflection, situational judgment, and cultural fit using the STAR method framework.",
  };

  return `You are an expert interview question generator. Create exactly 5 interview questions for a ${params.mode} interview.

Target Role: ${params.targetRole}
Candidate Skill Level: ${params.skillLevel}
${params.difficulty ? `Difficulty: ${params.difficulty}` : ""}
${params.topic ? `Topic Focus: ${params.topic}` : ""}
${params.language ? `Programming Language: ${params.language}` : ""}

Mode-specific guidance:
${modeDescriptions[params.mode] || modeDescriptions.technical}

Rules:
- Generate exactly 5 questions
- Questions should be challenging but fair for a ${params.skillLevel} level candidate targeting a ${params.targetRole} role
- Vary the difficulty across questions
- Make questions specific and contextual, not generic
${params.mode === "technical" && params.language ? `- Include the language "${params.language}" in the question where natural` : ""}

Return ONLY valid JSON matching this exact shape:
{
  "questions": [
    {
      "questionOrder": 1,
      "questionText": "The full question text here...",
      "language": "${params.language || ""}"
    }
  ]
}

${params.mode !== "technical" ? 'Omit the "language" field for non-technical questions.' : ""}`;
}
