import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../config/env";
import { logger } from "../logger";
import type { JobExtractionService, JobExtractionResult } from "./job-extraction.interface";
import { buildExtractionPrompt, extractionResultSchema } from "./resume-tailoring";

export class GeminiJobExtractionProvider implements JobExtractionService {
  private model;

  constructor() {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
    this.model = genAI.getGenerativeModel({
      model: env.GEMINI_MODEL,
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });
  }

  async extractSkills(jobDescription: string): Promise<JobExtractionResult> {
    const prompt = buildExtractionPrompt(jobDescription);
    logger.info("Calling Gemini for job skill extraction");

    const result = await Promise.race([
      this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
      timeout(env.GEMINI_TIMEOUT_MS),
    ] as const);

    const content = result.response.text();
    if (!content) {
      throw new Error("Gemini returned empty response for job extraction");
    }

    return parseAndValidate(content, () =>
      this.model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  prompt +
                  "\n\nCRITICAL: You MUST return valid JSON with skillName and importance fields. Include at least 3 skills.",
              },
            ],
          },
        ],
      }).then((r) => r.response.text())
    );
  }
}

async function parseAndValidate(
  content: string,
  retry: () => Promise<string | null | undefined>
): Promise<JobExtractionResult> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    logger.warn("Gemini job extraction response was not valid JSON, retrying");
    return retryAndValidate(retry);
  }

  const validation = extractionResultSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn({ errors: validation.error.errors }, "Gemini job extraction failed Zod, retrying");
    return retryAndValidate(retry);
  }

  return { skills: validation.data.skills };
}

async function retryAndValidate(
  retry: () => Promise<string | null | undefined>
): Promise<JobExtractionResult> {
  const retryContent = await retry();
  if (!retryContent) {
    throw new Error("Gemini returned empty response on extraction retry");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(retryContent) as Record<string, unknown>;
  } catch {
    throw new Error("Gemini returned malformed JSON on extraction retry");
  }

  const retryValidation = extractionResultSchema.safeParse(parsed);
  if (!retryValidation.success) {
    throw new Error("Gemini job extraction failed schema validation after retry");
  }

  return { skills: retryValidation.data.skills };
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Gemini request timed out after ${ms}ms`)), ms)
  );
}
