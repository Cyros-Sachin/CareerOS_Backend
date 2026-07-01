import { Request, Response, NextFunction } from "express";
import { CollegeService } from "./college.service";

export class CollegeController {
  constructor(private collegeService: CollegeService) {}

  createBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.collegeService.createBatch(req.user!.userId, req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  listBatches = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.collegeService.listBatches(req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getBatchAnalytics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.collegeService.getBatchAnalytics(req.params.id, req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getBatchStudents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = Number(req.query.limit) || 50;
      const result = await this.collegeService.getBatchStudents(req.params.id, req.user!.userId, limit);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  setConsent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.collegeService.setConsent(req.user!.userId, req.body.consent);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getMyInstitution = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.collegeService.getMyInstitution(req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
