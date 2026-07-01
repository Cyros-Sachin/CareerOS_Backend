import OpenAI from "openai";
import { env } from "../../config/env";
import { logger } from "../logger";
import type { JobExtractionService, JobExtractionResult } from "./job-extraction.interface";
import { buildExtractionPrompt, extractionResultSchema } from "./resume-tailoring";

const SYSTEM_PROMPT = `You are an expert job description parser. Extract structured skill information from job descriptions.

Return ONLY valid JSON matching this exact shape:
{
  "skills": [
    { "skillName": "JavaScript", "importance": "required" },
    { "skillName": "TypeScript", "importance": "preferred" }
  ]
}

Rules:
- Extract all explicitly mentioned technical and domain skills
- Classify each as "required" (must-have) or "preferred" (nice-to-have)
- Be specific: "React" not "frontend framework"
- Do NOT include generic personality traits
- Include at least 3 skills`;

export class OpenAIJobExtractionProvider implements JobExtractionService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_TIMEOUT_MS,
      maxRetries: 2,
    });
  }

  async extractSkills(jobDescription: string): Promise<JobExtractionResult> {
    const userPrompt = buildExtractionPrompt(jobDescription);
    logger.info("Calling OpenAI for job skill extraction");

    const response = await this.client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response for job extraction");
    }

    return parseAndValidate(content, async () => {
      const retryResponse = await this.client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\nCRITICAL: You MUST return valid JSON." },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });
      return retryResponse.choices[0]?.message?.content;
    });
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
    logger.warn("OpenAI job extraction response was not valid JSON, retrying");
    return retryAndValidate(retry);
  }

  const validation = extractionResultSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn({ errors: validation.error.errors }, "OpenAI job extraction failed Zod, retrying");
    return retryAndValidate(retry);
  }

  return { skills: validation.data.skills };
}

async function retryAndValidate(
  retry: () => Promise<string | null | undefined>
): Promise<JobExtractionResult> {
  const retryContent = await retry();
  if (!retryContent) {
    throw new Error("OpenAI returned empty response on extraction retry");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(retryContent) as Record<string, unknown>;
  } catch {
    throw new Error("OpenAI returned malformed JSON on extraction retry");
  }

  const retryValidation = extractionResultSchema.safeParse(parsed);
  if (!retryValidation.success) {
    throw new Error("OpenAI job extraction failed schema validation after retry");
  }

  return { skills: retryValidation.data.skills };
}
