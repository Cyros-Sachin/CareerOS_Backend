import { Request, Response, NextFunction } from "express";
import { InterviewService } from "./interview.service";

export class InterviewController {
  constructor(private interviewService: InterviewService) {}

  startSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { mode, difficulty, topic, language } = req.body;
      const result = await this.interviewService.startSession(req.user!.userId, {
        mode,
        difficulty,
        topic,
        language,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  getSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.interviewService.getSessionDetail(
        req.params.sessionId,
        req.user!.userId
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  autosaveAnswer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { answerText } = req.body;
      const result = await this.interviewService.autosaveAnswer(
        req.params.questionId,
        req.params.sessionId,
        req.user!.userId,
        answerText
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  submitAnswer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { answerText } = req.body;
      const result = await this.interviewService.submitAnswer(
        req.params.questionId,
        req.params.sessionId,
        req.user!.userId,
        answerText
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  completeSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.interviewService.completeSession(
        req.params.sessionId,
        req.user!.userId
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.interviewService.getReport(
        req.params.sessionId,
        req.user!.userId
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 20;
      const result = await this.interviewService.getHistory(req.user!.userId, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  abandonSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.interviewService.abandonSession(
        req.params.sessionId,
        req.user!.userId
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
