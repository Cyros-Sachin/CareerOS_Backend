import OpenAI from "openai";
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

const SYSTEM_PROMPT_QUESTION = `You are an expert interview question generator. Generate exactly 5 interview questions for a specific mode (technical, system design, or HR).

Return ONLY valid JSON matching this exact shape:
{
  "questions": [
    {
      "questionOrder": 1,
      "questionText": "The full question text here...",
      "language": "optional language field for technical mode"
    }
  ]
}

- Always generate exactly 5 questions
- Vary difficulty across questions
- Make questions specific and contextual
- For non-technical modes, omit the "language" field`;

const SYSTEM_PROMPT_EVALUATION = `You are an expert interview evaluator. Evaluate interview answers across 5 dimensions.

Return ONLY valid JSON matching this exact shape:
{
  "score": {
    "correctness_soundness": 85,
    "complexity_tradeoff_awareness": 70,
    "communication_clarity": 90,
    "best_practices": 75,
    "completeness": 80
  },
  "feedback": "2-4 sentences of actionable, specific feedback.",
  "modelAnswer": "A strong reference answer."
}

- All score values must be integers between 0 and 100
- Feedback should be specific and actionable
- modelAnswer should represent a realistic strong answer`;

export class OpenAIInterviewProvider implements InterviewAIService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_TIMEOUT_MS,
      maxRetries: 2,
    });
  }

  async generateQuestions(params: QuestionGenerationParams): Promise<InterviewQuestionSet> {
    const userPrompt = buildQuestionGenPrompt(params);
    logger.info(
      { mode: params.mode, targetRole: params.targetRole },
      "Calling OpenAI for interview question generation"
    );

    const response = await this.client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_QUESTION },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response for question generation");
    }

    return parseAndValidateQuestions(content, async () => {
      const retryResponse = await this.client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_QUESTION + "\n\nCRITICAL: You MUST return valid JSON with exactly 5 questions." },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });
      return retryResponse.choices[0]?.message?.content;
    });
  }

  async evaluateAnswer(params: AnswerEvaluationParams): Promise<AnswerEvaluation> {
    const userPrompt = buildEvaluationPrompt(params);
    logger.info("Calling OpenAI for answer evaluation");

    const response = await this.client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_EVALUATION },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response for answer evaluation");
    }

    return parseAndValidateEvaluation(content, async () => {
      const retryResponse = await this.client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT_EVALUATION + "\n\nCRITICAL: You MUST return valid JSON with score, feedback, and modelAnswer." },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      });
      return retryResponse.choices[0]?.message?.content;
    });
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
    logger.warn("OpenAI interview questions response was not valid JSON, retrying");
    return retryAndValidateQuestions(retry);
  }

  const validation = interviewQuestionSetSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn({ errors: validation.error.errors }, "OpenAI interview questions failed Zod, retrying");
    return retryAndValidateQuestions(retry);
  }

  return validation.data as InterviewQuestionSet;
}

async function retryAndValidateQuestions(
  retry: () => Promise<string | null | undefined>
): Promise<InterviewQuestionSet> {
  const retryContent = await retry();
  if (!retryContent) {
    throw new Error("OpenAI returned empty response on question generation retry");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(retryContent) as Record<string, unknown>;
  } catch {
    throw new Error("OpenAI returned malformed JSON on question generation retry");
  }

  const retryValidation = interviewQuestionSetSchema.safeParse(parsed);
  if (!retryValidation.success) {
    throw new Error("OpenAI interview questions failed schema validation after retry");
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
    logger.warn("OpenAI interview evaluation response was not valid JSON, retrying");
    return retryAndValidateEvaluation(retry);
  }

  const validation = answerEvaluationSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn({ errors: validation.error.errors }, "OpenAI interview evaluation failed Zod, retrying");
    return retryAndValidateEvaluation(retry);
  }

  return validation.data as AnswerEvaluation;
}

async function retryAndValidateEvaluation(
  retry: () => Promise<string | null | undefined>
): Promise<AnswerEvaluation> {
  const retryContent = await retry();
  if (!retryContent) {
    throw new Error("OpenAI returned empty response on evaluation retry");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(retryContent) as Record<string, unknown>;
  } catch {
    throw new Error("OpenAI returned malformed JSON on evaluation retry");
  }

  const retryValidation = answerEvaluationSchema.safeParse(parsed);
  if (!retryValidation.success) {
    throw new Error("OpenAI interview evaluation failed schema validation after retry");
  }

  return retryValidation.data as AnswerEvaluation;
}
