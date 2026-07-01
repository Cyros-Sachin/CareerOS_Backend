import { z } from "zod";

export const matchesQuerySchema = z.object({
  location: z.string().optional(),
  companyType: z.enum(["startup", "mid_size", "enterprise", "other"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const manualJobSchema = z.object({
  jobUrl: z.string().url().optional(),
  jobText: z.string().min(50, "Job description must be at least 50 characters").max(20000),
});

export const applyJobSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const updateApplicationSchema = z.object({
  status: z.enum(["applied", "interview", "offer", "rejected"]),
  notes: z.string().max(2000).optional(),
});

export const applicationsQuerySchema = z.object({
  status: z.enum(["applied", "interview", "offer", "rejected"]).optional(),
});

export type MatchesQueryInput = z.infer<typeof matchesQuerySchema>;
export type ManualJobInput = z.infer<typeof manualJobSchema>;
export type ApplyJobInput = z.infer<typeof applyJobSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
