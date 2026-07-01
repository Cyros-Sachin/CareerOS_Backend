import { Request, Response, NextFunction } from "express";
import { MentorService } from "./mentor.service";
import { HttpError } from "../../middleware/errorHandler";
import { logger } from "../../lib/logger";

export class MentorController {
  constructor(private mentorService: MentorService) {}

  getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const result = await this.mentorService.getHistory(req.user!.userId, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  chat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { message } = req.body;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const heartbeat = setInterval(() => {
      res.write(":ping\n\n");
    }, 15000);

    const onChunk = (text: string) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    };

    let fullText: string;
    try {
      fullText = await this.mentorService.chat(req.user!.userId, message, onChunk);
    } catch (err) {
      clearInterval(heartbeat);

      if (err instanceof HttpError) {
        res.write(`data: ${JSON.stringify({ error: { code: err.code, message: err.message } })}\n\n`);
      } else {
        logger.error({ err }, "Mentor chat error");
        res.write(`data: ${JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } })}\n\n`);
      }

      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    clearInterval(heartbeat);
    res.write("data: [DONE]\n\n");
    res.end();
  };

  getSuggestedPrompts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.mentorService.getSuggestedPrompts(req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  githubAudit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { githubUrl } = req.body;
      const result = await this.mentorService.githubAudit(req.user!.userId, githubUrl);
      console.log(result)
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
