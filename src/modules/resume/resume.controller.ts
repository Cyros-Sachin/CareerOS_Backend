import { Request, Response, NextFunction } from "express";
import { ResumeService } from "./resume.service";

export class ResumeController {
  constructor(private resumeService: ResumeService) {}

  requestUploadUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { filename, mimeType, fileSizeBytes } = req.body;
      const result = await this.resumeService.requestUploadUrl(
        req.user!.userId,
        filename,
        mimeType,
        fileSizeBytes,
        req.user!.role
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  confirmUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.resumeService.confirmUpload(req.params.id, req.user!.userId);
      res.status(202).json({ message: "Resume upload confirmed. Parsing started." });
    } catch (err) {
      next(err);
    }
  };

  getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.resumeService.getStatus(req.params.id, req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getResumeDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.resumeService.getResumeDetail(req.params.id, req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getScore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.resumeService.getScore(req.params.id, req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const result = await this.resumeService.getHistory(req.user!.userId, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  listResumes = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.resumeService.listResumes(req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  activateResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.resumeService.activateResume(req.params.id, req.user!.userId);
      res.json({ message: "Resume activated" });
    } catch (err) {
      next(err);
    }
  };

  deleteResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.resumeService.deleteResume(req.params.id, req.user!.userId);
      res.json({ message: "Resume deleted" });
    } catch (err) {
      next(err);
    }
  };
}
