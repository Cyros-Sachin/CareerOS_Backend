import { z } from "zod";

export const startSessionSchema = z.object({
  mode: z.enum(["technical", "system_design", "hr"]),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  topic: z.string().max(100).optional(),
  language: z.enum(["javascript", "python", "java", "cpp"]).optional(),
});

export const autosaveAnswerSchema = z.object({
  answerText: z.string(),
});

export const submitAnswerSchema = z.object({
  answerText: z.string().min(1, "Answer text is required"),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type AutosaveAnswerInput = z.infer<typeof autosaveAnswerSchema>;
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
