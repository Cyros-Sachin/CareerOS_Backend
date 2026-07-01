import { z } from "zod";

export const chatSchema = z.object({
  message: z.string().min(1).max(5000),
});

export const githubAuditSchema = z.object({
  githubUrl: z.string().url().regex(/^https?:\/\/(www\.)?github\.com\//, "Must be a valid GitHub profile URL"),
});

export type ChatInput = z.infer<typeof chatSchema>;
export type GithubAuditInput = z.infer<typeof githubAuditSchema>;
