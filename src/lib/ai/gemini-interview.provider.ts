import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../logger";
import type {
  InterviewAIService,
  QuestionGenerationParams,
  AnswerEvaluationParams,
  InterviewQuestionSet,
  AnswerEvaluation,
} from "./interview-question-gen.interface";
import { answerEvaluationSchema, buildEvaluationPrompt, buildQuestionGenPrompt } from "./interview-scoring";

const interviewQuestionSchema = z.object({
  questionOrder: z.number().int().min(1).max(5),
  questionText: z.string().min(1),
  language: z.string().optional(),
});

const interviewQuestionSetSchema = z.object({
  questions: z.array(interviewQuestionSchema).length(5),
});

export class GeminiInterviewProvider implements InterviewAIService {
  private model;

  constructor() {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
    this.model = genAI.getGenerativeModel({
      model: env.GEMINI_MODEL,
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    });
  }

  async generateQuestions(params: QuestionGenerationParams): Promise<InterviewQuestionSet> {
    const prompt = buildQuestionGenPrompt(params);
    logger.info(
      { mode: params.mode, targetRole: params.targetRole },
      "Calling Gemini for interview question generation"
    );

    const result = await Promise.race([
      this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
      timeout(env.GEMINI_TIMEOUT_MS),
    ] as const);

    const content = result.response.text();
    if (!content) {
      throw new Error("Gemini returned empty response for question generation");
    }

    return parseAndValidateQuestions(content, () =>
      this.model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  prompt +
                  "\n\nCRITICAL: You MUST return valid JSON with exactly 5 questions matching the schema above. Do not omit any fields.",
              },
            ],
          },
        ],
      }).then((r) => r.response.text())
    );
  }

  async evaluateAnswer(params: AnswerEvaluationParams): Promise<AnswerEvaluation> {
    const prompt = buildEvaluationPrompt(params);
    logger.info("Calling Gemini for answer evaluation");

    const result = await Promise.race([
      this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
      timeout(env.GEMINI_TIMEOUT_MS),
    ] as const);

    const content = result.response.text();
    if (!content) {
      throw new Error("Gemini returned empty response for answer evaluation");
    }

    return parseAndValidateEvaluation(content, () =>
      this.model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  prompt +
                  "\n\nCRITICAL: You MUST return valid JSON with score, feedback, and modelAnswer fields matching the schema.",
              },
            ],
          },
        ],
      }).then((r) => r.response.text())
    );
  }
}

async function parseAndValidateQuestions(
  content: string,
  retry: () => Promise<string | null | undefined>
): Promise<InterviewQuestionSet> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    logger.warn("Gemini interview questions response was not valid JSON, retrying");
    return retryAndValidateQuestions(retry);
  }

  const validation = interviewQuestionSetSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn({ errors: validation.error.errors }, "Gemini interview questions failed Zod, retrying");
    return retryAndValidateQuestions(retry);
  }

  return validation.data as InterviewQuestionSet;
}

async function retryAndValidateQuestions(
  retry: () => Promise<string | null | undefined>
): Promise<InterviewQuestionSet> {
  const retryContent = await retry();
  if (!retryContent) {
    throw new Error("Gemini returned empty response on question generation retry");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(retryContent) as Record<string, unknown>;
  } catch {
    throw new Error("Gemini returned malformed JSON on question generation retry");
  }

  const retryValidation = interviewQuestionSetSchema.safeParse(parsed);
  if (!retryValidation.success) {
    throw new Error("Gemini interview questions failed schema validation after retry");
  }

  return retryValidation.data as InterviewQuestionSet;
}

async function parseAndValidateEvaluation(
  content: string,
  retry: () => Promise<string | null | undefined>
): Promise<AnswerEvaluation> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    logger.warn("Gemini interview evaluation response was not valid JSON, retrying");
    return retryAndValidateEvaluation(retry);
  }

  const validation = answerEvaluationSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn({ errors: validation.error.errors }, "Gemini interview evaluation failed Zod, retrying");
    return retryAndValidateEvaluation(retry);
  }

  return validation.data as AnswerEvaluation;
}

async function retryAndValidateEvaluation(
  retry: () => Promise<string | null | undefined>
): Promise<AnswerEvaluation> {
  const retryContent = await retry();
  if (!retryContent) {
    throw new Error("Gemini returned empty response on evaluation retry");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(retryContent) as Record<string, unknown>;
  } catch {
    throw new Error("Gemini returned malformed JSON on evaluation retry");
  }

  const retryValidation = answerEvaluationSchema.safeParse(parsed);
  if (!retryValidation.success) {
    throw new Error("Gemini interview evaluation failed schema validation after retry");
  }

  return retryValidation.data as AnswerEvaluation;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Gemini request timed out after ${ms}ms`)), ms)
  );
}
