import {
    Request,
    Response,
} from "express";

import {
    createResume,
    getResume,
    getUserResumes,
} from "./resume.service";

import { AuthRequest }
    from "../../middleware/auth.middleware";
import {
    processResume,
} from "./resume.service";
export async function uploadResume(
    req: AuthRequest,
    res: Response
) {
    try {
        if (!req.file) {
            return res.status(400).json({
                message:
                    "Resume required",
            });
        }

        const resume =
            await createResume(
                req.user!.userId,
                req.file.path
            );

        await processResume(
            resume.id
        );

        res.status(201).json(
            resume
        );
    } catch (err: any) {
        res.status(500).json({
            message: err.message,
        });
    }
}

export async function listResumes(
    req: AuthRequest,
    res: Response
) {
    try {
        const resumes =
            await getUserResumes(
                req.user!.userId
            );

        res.json(resumes);
    } catch (err: any) {
        res.status(500).json({
            message: err.message,
        });
    }
}
export async function getResumeById(
    req: AuthRequest,
    res: Response
) {
    const resume =
        await getResume(
            req.params.id as string
        );

    res.json(resume);
}