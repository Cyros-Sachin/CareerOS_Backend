import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { env } from "../../config/env";
import { logger } from "../logger";
import type { RoadmapGeneratorService, RoadmapPlan, RoadmapGenerationParams } from "./roadmap-generator.interface";

const roadmapResourceSchema = z.object({
  type: z.enum(["doc", "video", "course"]),
  url: z.string().url(),
  title: z.string(),
  isAffiliate: z.boolean(),
});

const roadmapItemSchema = z.object({
  monthNumber: z.number().int().positive(),
  topic: z.string(),
  resources: z.array(roadmapResourceSchema).min(3),
  projectAssignment: z.string().nullable(),
  estimatedHours: z.number().int().nullable(),
});

const roadmapPlanSchema = z.object({
  items: z.array(roadmapItemSchema),
});

function buildPrompt(params: RoadmapGenerationParams): string {
  const missingSkillsBlock = params.missingSkills
    .map((s) => `  - ${s.skillName} (importance: ${s.importanceWeight}, est. hours: ${s.estLearningHours ?? "unknown"})`)
    .join("\n");

  return `You are a career roadmap generator. Create a structured month-by-month learning plan.

Target Role: ${params.targetRole}
Current Skill Level: ${params.currentSkillLevel}
Hours Available Per Week: ${params.hoursPerWeek}
Maximum Months: ${params.maxMonths}

Current Skills:
${params.currentSkills.map((s) => `  - ${s}`).join("\n")}

Skills to Acquire (ordered by importance):
${missingSkillsBlock || "  (none specified — infer from target role)"}

Return ONLY valid JSON matching this exact shape:
{
  "items": [
    {
      "monthNumber": 1,
      "topic": "string",
      "resources": [
        { "type": "doc|video|course", "url": "https://...", "title": "string", "isAffiliate": false }
      ],
      "projectAssignment": "string or null",
      "estimatedHours": 20
    }
  ]
}

Constraints:
- Generate exactly enough months to cover the missing skills, up to ${params.maxMonths} months
- Each month must have at least 3 learning resources (documentation, video, or course)
- Prioritize high-importance skills first
- Assign practical project assignments each month
- Keep each month realistic for ${params.hoursPerWeek} hours/week
- Never fabricate data — use real, well-known resources`;
}

export class GeminiRoadmapProvider implements RoadmapGeneratorService {
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

  async generateRoadmap(params: RoadmapGenerationParams): Promise<RoadmapPlan> {
    const prompt = buildPrompt(params);
    logger.info({ targetRole: params.targetRole, maxMonths: params.maxMonths }, "Calling Gemini for roadmap generation");

    const result = await Promise.race([
      this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
      timeout(env.GEMINI_TIMEOUT_MS),
    ] as const);

    const content = result.response.text();
    if (!content) {
      throw new Error("Gemini returned empty response");
    }

    return parseAndValidate(content, () =>
      this.model.generateContent({
        contents: [
          { role: "user", parts: [{ text: prompt + "\n\nCRITICAL: You MUST return valid JSON matching the exact schema above. Do not omit any fields." }] },
        ],
      }).then((r) => r.response.text())
    );
  }
}

async function parseAndValidate(
  content: string,
  retry: () => Promise<string | null | undefined>
): Promise<RoadmapPlan> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    logger.warn("Gemini roadmap response was not valid JSON, retrying");
    return retryAndValidate(retry);
  }

  const validation = roadmapPlanSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn({ errors: validation.error.errors }, "Gemini roadmap response failed Zod, retrying");
    return retryAndValidate(retry);
  }

  return validation.data;
}

async function retryAndValidate(retry: () => Promise<string | null | undefined>): Promise<RoadmapPlan> {
  const retryContent = await retry();
  if (!retryContent) {
    throw new Error("Gemini returned empty response on retry");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(retryContent) as Record<string, unknown>;
  } catch {
    throw new Error("Gemini returned malformed JSON on retry");
  }

  const retryValidation = roadmapPlanSchema.safeParse(parsed);
  if (!retryValidation.success) {
    throw new Error("Gemini roadmap response failed schema validation after retry");
  }

  return retryValidation.data;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Gemini request timed out after ${ms}ms`)), ms)
  );
}
