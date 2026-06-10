import { z } from "zod";

export const registerSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export const onboardingSchema = z.object({
  name: z.string().min(2),

  college: z.string().min(2),

  degree: z.string().min(2),

  graduationYear: z.number(),

  careerGoals: z.array(
    z.string()
  ),

  targetCompanies: z.array(
    z.string()
  ),

  skillLevel: z.enum([
    "BEGINNER",
    "INTERMEDIATE",
    "ADVANCED",
  ]),

  workMode: z.enum([
    "REMOTE",
    "HYBRID",
    "ONSITE",
  ]),
});