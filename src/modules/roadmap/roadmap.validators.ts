import { z } from "zod";

export const generateRoadmapSchema = z.object({
  targetRole: z.string().min(1).max(255),
  hoursPerWeek: z.number().int().min(1).max(168),
});

export const regenerateRoadmapSchema = z.object({
  hoursPerWeek: z.number().int().min(1).max(168).optional(),
});

export const completeItemSchema = z.object({
  isComplete: z.boolean(),
});

export type GenerateRoadmapInput = z.infer<typeof generateRoadmapSchema>;
export type RegenerateRoadmapInput = z.infer<typeof regenerateRoadmapSchema>;
export type CompleteItemInput = z.infer<typeof completeItemSchema>;
