import { z } from "zod";

export const step1Schema = z.object({
  name: z.string().min(1).max(255).optional(),
  college: z.string().max(255).nullable().optional(),
  degree: z.string().max(100).nullable().optional(),
  graduationYear: z.number().int().min(1900).max(2100).nullable().optional(),
});

export const step2Schema = z.object({
  careerGoals: z.array(z.string().max(500)),
});

export const step3Schema = z.object({
  workPreferences: z.array(z.string().max(500)),
  targetCompanies: z.array(z.string().max(500)),
});

export const step4Schema = z.object({
  skillLevel: z.enum(["beginner", "mid", "advanced"]),
});

export const completeSchema = z.object({
  skippedResume: z.boolean(),
});

export type Step1Input = z.infer<typeof step1Schema>;
export type Step2Input = z.infer<typeof step2Schema>;
export type Step3Input = z.infer<typeof step3Schema>;
export type Step4Input = z.infer<typeof step4Schema>;
export type CompleteInput = z.infer<typeof completeSchema>;
