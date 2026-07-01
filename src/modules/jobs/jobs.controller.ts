import { Request, Response, NextFunction } from "express";
import { JobsService } from "./jobs.service";

export class JobsController {
  constructor(private jobsService: JobsService) {}

  getMatches = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { location, companyType, limit } = req.query as any;
      const result = await this.jobsService.getMatches(req.user!.userId, {
        location,
        companyType,
        limit: limit || 20,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getJobDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobsService.getJobDetail(req.params.jobId, req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  submitManualJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jobUrl, jobText } = req.body;
      const result = await this.jobsService.submitManualJob(req.user!.userId, { jobUrl, jobText });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  tailorResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobsService.tailorResume(req.params.jobId, req.user!.userId);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  getTailoredResume = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.jobsService.getTailoredResume(
        req.params.tailoredResumeId,
        req.user!.userId
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  applyToJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { notes } = req.body;
      const result = await this.jobsService.applyToJob(
        req.params.jobId,
        req.user!.userId,
        notes
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  updateApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, notes } = req.body;
      const result = await this.jobsService.updateApplication(
        req.params.applicationId,
        req.user!.userId,
        { status, notes }
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getApplications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = req.query.status as string | undefined;
      const result = await this.jobsService.getApplications(req.user!.userId, status);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
