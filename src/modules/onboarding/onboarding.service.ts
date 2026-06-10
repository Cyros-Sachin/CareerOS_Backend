import { prisma } from "../../config/prisma";

export async function saveOnboarding(
  userId: string,
  data: {
    name: string;
    college: string;
    degree: string;
    graduationYear: number;

    careerGoals: string[];

    targetCompanies: string[];

    skillLevel:
      | "BEGINNER"
      | "INTERMEDIATE"
      | "ADVANCED";

    workMode:
      | "REMOTE"
      | "HYBRID"
      | "ONSITE";
  }
) {
  return prisma.profile.upsert({
    where: {
      userId,
    },

    update: {
      ...data,
    },

    create: {
      userId,
      ...data,
    },
  });
}

export async function getProfile(
  userId: string
) {
  return prisma.profile.findUnique({
    where: {
      userId,
    },
  });
}