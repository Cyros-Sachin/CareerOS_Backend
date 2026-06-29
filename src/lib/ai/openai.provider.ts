import OpenAI from "openai";
import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../logger";
import type { ResumeParserService, ParsedResumeData } from "./resume-parser.interface";

const parsedResumeSchema: z.ZodType<ParsedResumeData> = z.object({
  skills: z.array(z.string()),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      techStack: z.array(z.string()),
      githubUrl: z.string().nullable(),
      impactStatement: z.string().nullable(),
    })
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      field: z.string(),
      graduationYear: z.number().int().nullable(),
    })
  ),
  experience: z.array(
    z.object({
      company: z.string(),
      role: z.string(),
      type: z.enum(["internship", "full-time", "open-source"]),
      durationMonths: z.number().int().nullable(),
      description: z.string(),
    })
  ),
  certifications: z.array(z.string()),
});

const SYSTEM_PROMPT = `You are a resume parser. Extract structured data from the resume text below.
Return ONLY valid JSON matching this exact shape, with no markdown formatting:

{
  "skills": ["string"],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "techStack": ["string"],
      "githubUrl": "string | null",
      "impactStatement": "string | null"
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "field": "string",
      "graduationYear": "number | null"
    }
  ],
  "experience": [
    {
      "company": "string",
      "role": "string",
      "type": "internship | full-time | open-source",
      "durationMonths": "number | null",
      "description": "string"
    }
  ],
  "certifications": ["string"]
}

If a section is absent from the resume, return an empty array for it. Never fabricate data not present in the source text.`;

export class OpenAIProvider implements ResumeParserService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_TIMEOUT_MS,
      maxRetries: 2,
    });
  }

  async parseResume(rawText: string): Promise<ParsedResumeData> {
    logger.info({ textLength: rawText.length }, "Calling OpenAI for resume parsing");

    const response = await this.client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: rawText },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned empty response");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error("OpenAI returned malformed JSON");
    }

    const validationResult = parsedResumeSchema.safeParse(parsed);
    if (!validationResult.success) {
      logger.warn({ errors: validationResult.error.errors }, "OpenAI response failed Zod validation, retrying with stricter prompt");

      const retryResponse = await this.client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\nCRITICAL: You MUST return valid JSON matching the exact schema above. Do not omit any fields. Use null for missing values, empty arrays for missing sections." },
          { role: "user", content: rawText },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      });

      const retryContent = retryResponse.choices[0]?.message?.content;
      if (!retryContent) {
        throw new Error("OpenAI returned empty response on retry");
      }

      try {
        parsed = JSON.parse(retryContent) as Record<string, unknown>;
      } catch {
        throw new Error("OpenAI returned malformed JSON on retry");
      }

      const retryValidation = parsedResumeSchema.safeParse(parsed);
      if (!retryValidation.success) {
        throw new Error("OpenAI response failed schema validation after retry");
      }

      return retryValidation.data;
    }

    return validationResult.data;
  }
}
