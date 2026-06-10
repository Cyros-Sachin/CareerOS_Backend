import { prisma } from "../../config/prisma";
import { parseResume }
    from "./parser.service";

import { calculateATS }
    from "./ats.service";
export async function createResume(
    userId: string,
    fileUrl: string
) {
    return prisma.resume.create({
        data: {
            userId,
            fileUrl,
            status: "PROCESSING",
        },
    });
}

export async function getUserResumes(
    userId: string
) {
    return prisma.resume.findMany({
        where: {
            userId,
        },

        orderBy: {
            createdAt: "desc",
        },
    });
}
export async function processResume(
    resumeId: string
) {
    const resume =
        await prisma.resume.findUnique({
            where: {
                id: resumeId,
            },
        });

    if (!resume) {
        throw new Error(
            "Resume not found"
        );
    }

    const text =
        await parseResume(
            resume.fileUrl
        );

    const ats =
        calculateATS(text);

    await prisma.resume.update({
        where: {
            id: resumeId,
        },

        data: {
            status: "COMPLETED",

            parsedData: {
                rawText: text
            },

            atsScore: ats.score,

            atsFeedback: {
                matchedSkills:
                    ats.matchedSkills,

                feedback:
                    ats.feedback,
            }
        },
    });

    return ats;
}
export async function getResume(
    id: string
) {
    return prisma.resume.findUnique({
        where: {
            id,
        },
    });
}