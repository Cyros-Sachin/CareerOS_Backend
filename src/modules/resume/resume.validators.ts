import { z } from "zod";

export const uploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  fileSizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});

export const completeSchema = z.object({
  skippedResume: z.boolean().optional(),
});

export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
