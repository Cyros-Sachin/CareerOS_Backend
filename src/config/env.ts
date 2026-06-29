import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),
  RESEND_API_KEY: z.string().default(""),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  // Milestone 2 — Resume Engine
  AWS_REGION: z.string().default("ap-south-1"),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().default("careeros-resumes"),

  // AI Provider selection
  AI_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),

  // Google Gemini (default provider)
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().default(30000),

  // OpenAI (fallback / production alternative)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_TIMEOUT_MS: z.coerce.number().default(30000),

  RESUME_MAX_SIZE_MB: z.coerce.number().default(5),
  RESUME_MAX_PAGES: z.coerce.number().default(3),
  FREE_TIER_MONTHLY_SCAN_LIMIT: z.coerce.number().default(3),

  // Milestone 3 — Embeddings & Gap Analysis
  EMBEDDING_PROVIDER: z.enum(["gemini", "openai"]).default("gemini"),
  GEMINI_EMBEDDING_MODEL: z.string().default("text-embedding-004"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  GAP_SEMANTIC_MATCH_THRESHOLD: z.coerce.number().default(0.85),
  GAP_ANALYSIS_LLM_TIEBREAK: z.coerce.boolean().default(false),

  // Milestone 3 — Roadmap Generation
  ROADMAP_MAX_MONTHS: z.coerce.number().default(12),
  ROADMAP_GENERATE_RATE_LIMIT_PER_HOUR: z.coerce.number().default(5),
  AFFILIATE_REF_TAG: z.string().default("careeros"),
})

  .superRefine((data, ctx) => {
    if (data.AI_PROVIDER === "gemini" && !data.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GEMINI_API_KEY is required when AI_PROVIDER is 'gemini'",
        path: ["GEMINI_API_KEY"],
      });
    }
    if (data.AI_PROVIDER === "openai" && !data.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OPENAI_API_KEY is required when AI_PROVIDER is 'openai'",
        path: ["OPENAI_API_KEY"],
      });
    }
  });

function loadEnv() {
  console.log(process.env.DATABASE_URL);
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
