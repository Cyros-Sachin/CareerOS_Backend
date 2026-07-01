import { z } from "zod";

export const createBatchSchema = z.object({
  degree: z.string().min(1, "Degree is required").max(100),
  graduationYear: z.number().int().min(1950).max(2100),
  label: z.string().max(255).optional(),
});

export const consentSchema = z.object({
  consent: z.boolean(),
});

export const studentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type ConsentInput = z.infer<typeof consentSchema>;
