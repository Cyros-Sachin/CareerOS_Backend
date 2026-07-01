import { z } from "zod";
import type { TailoredResumeContent } from "./job-extraction.interface";

export const tailoredResumeSchema = z.object({
  skills: z.array(z.string()),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string(),
    techStack: z.array(z.string()),
    githubUrl: z.string().nullable().optional(),
    impactStatement: z.string().nullable().optional(),
  })),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    field: z.string(),
    graduationYear: z.number().int(),
  })),
  experience: z.array(z.object({
    company: z.string(),
    role: z.string(),
    type: z.string(),
    durationMonths: z.number().int(),
    description: z.string(),
  })),
  certifications: z.array(z.string()),
});

export type TailoredResumeInput = z.infer<typeof tailoredResumeSchema>;

export function buildTailoringPrompt(params: {
  parsedData: Record<string, unknown>;
  jobTitle: string;
  jobCompany: string;
  jobDescription: string;
  jobSkills: Array<{ skillName: string; importance: string }>;
}): string {
  return `You are an expert resume tailor. Rewrite the following resume sections to better match a specific job description.

## Current Resume Data
${JSON.stringify(params.parsedData, null, 2)}

## Target Job
Title: ${params.jobTitle}
Company: ${params.jobCompany}
Description: ${params.jobDescription}

## Required/Preferred Skills for This Job
${params.jobSkills.map((s) => `  - ${s.skillName} (${s.importance})`).join("\n")}

## Instructions
- Rewrite the experience descriptions to emphasize skills and achievements relevant to this specific role
- Reorder and prioritize projects that align with the job's tech stack
- Incorporate key terminology from the job description where natural
- Add any missing matching skills that the candidate plausibly has based on their existing experience
- Keep all information truthful — never fabricate experience or education
- Maintain the same overall structure (skills, projects, education, experience, certifications)

Return ONLY valid JSON matching this exact shape:
{
  "skills": ["skill1", "skill2"],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "techStack": ["tech1", "tech2"],
      "githubUrl": "https://...",
      "impactStatement": "string"
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "field": "string",
      "graduationYear": 2025
    }
  ],
  "experience": [
    {
      "company": "string",
      "role": "string",
      "type": "full-time|internship|open-source",
      "durationMonths": 12,
      "description": "string"
    }
  ],
  "certifications": ["cert1"]
}`;
}

export function buildExtractionPrompt(jobDescription: string): string {
  return `Extract the key skills mentioned in the following job description. For each skill, classify it as either "required" (explicitly listed as a requirement/must-have) or "preferred" (mentioned as a plus/nice-to-have/preferred).

Job Description:
${jobDescription}

Return ONLY valid JSON matching this exact shape:
{
  "skills": [
    { "skillName": "JavaScript", "importance": "required" },
    { "skillName": "TypeScript", "importance": "preferred" }
  ]
}

Rules:
- Extract technical skills (programming languages, frameworks, tools, platforms)
- Extract domain skills (e.g., "project management", "agile", "leadership")
- Be specific about skill names (e.g., "React" not "frontend framework")
- Only include skills that are explicitly mentioned or very clearly implied
- Do NOT include generic traits like "team player", "communication skills" unless described as a distinct methodology`;
}

export const extractionResultSchema = z.object({
  skills: z.array(z.object({
    skillName: z.string().min(1),
    importance: z.enum(["required", "preferred"]),
  })).min(1, "At least one skill must be extracted"),
});
