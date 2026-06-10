import { Response }
from "express";

import { prisma }
from "../../config/prisma";

import { AuthRequest }
from "../../middleware/auth.middleware";

export async function getDashboard(
  req: AuthRequest,
  res: Response
) {
  const profile =
    await prisma.profile.findUnique({
      where: {
        userId:
          req.user!.userId,
      },
    });

  const latestResume =
    await prisma.resume.findFirst({
      where: {
        userId:
          req.user!.userId,
      },

      orderBy: {
        createdAt:
          "desc",
      },
    });

  res.json({
    profile,

    latestResume,

    careerScore:
      latestResume?.atsScore ??
      0,
  });
}