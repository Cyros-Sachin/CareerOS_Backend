import OpenAI from "openai";
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

const SYSTEM_PROMPT = `You are a career roadmap generator. Create a structured month-by-month learning plan.

Return ONLY valid JSON matching this exact shape, with no markdown formatting:
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
- Each month must have at least 3 learning resources
- Never fabricate data — use real, well-known resources
- Prioritize high-importance skills first
- Assign practical project assignments each month`;

function buildUserPrompt(params: RoadmapGenerationParams): string {
  const missingSkillsBlock = params.missingSkills
    .map((s) => `  - ${s.skillName} (importance: ${s.importanceWeight}, est. hours: ${s.estLearningHours ?? "unknown"})`)
    .join("\n");

  return `Target Role: ${params.targetRole}
Current Skill Level: ${params.currentSkillLevel}
Hours Per Week: ${params.hoursPerWeek}
Max Months: ${params.maxMonths}

Current Skills:
${params.currentSkills.map((s) => `  - ${s}`).join("\n")}

Skills to Acquire:
${missingSkillsBlock || "  (none specified — infer from target role)"}

Generate a roadmap with up to ${params.maxMonths} months of learning.`;
}

export class OpenAIRoadmapProvider implements RoadmapGeneratorService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_TIMEOUT_MS,
      maxRetries: 2,
    });
  }

  async generateRoadmap(params: RoadmapGenerationParams): Promise<RoadmapPlan> {
    const userPrompt = buildUserPrompt(params);
    logger.info({ targetRole: params.targetRole, maxMonths: params.maxMonths }, "Calling OpenAI for roadmap generation");

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
      throw new Error("OpenAI returned empty response");
    }

    return parseAndValidate(content, async () => {
      const retryResponse = await this.client.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + "\n\nCRITICAL: You MUST return valid JSON matching the exact schema above." },
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
): Promise<RoadmapPlan> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    logger.warn("OpenAI roadmap response was not valid JSON, retrying");
    return retryAndValidate(retry);
  }

  const validation = roadmapPlanSchema.safeParse(parsed);
  if (!validation.success) {
    logger.warn({ errors: validation.error.errors }, "OpenAI roadmap response failed Zod, retrying");
    return retryAndValidate(retry);
  }

  return validation.data;
}

async function retryAndValidate(retry: () => Promise<string | null | undefined>): Promise<RoadmapPlan> {
  const retryContent = await retry();
  if (!retryContent) {
    throw new Error("OpenAI returned empty response on retry");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(retryContent) as Record<string, unknown>;
  } catch {
    throw new Error("OpenAI returned malformed JSON on retry");
  }

  const retryValidation = roadmapPlanSchema.safeParse(parsed);
  if (!retryValidation.success) {
    throw new Error("OpenAI roadmap response failed schema validation after retry");
  }

  return retryValidation.data;
}
