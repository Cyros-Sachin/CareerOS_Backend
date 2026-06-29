import { Request, Response, NextFunction } from "express";
import { RoadmapService } from "./roadmap.service";

export class RoadmapController {
  constructor(private roadmapService: RoadmapService) {}

  generate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { targetRole, hoursPerWeek } = req.body;
      const result = await this.roadmapService.generate(req.user!.userId, targetRole, hoursPerWeek);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  getActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetRole = req.query.targetRole as string | undefined;
      const result = await this.roadmapService.getActive(req.params.userId, targetRole);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.roadmapService.getDetail(req.params.roadmapId, req.user!.userId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  toggleComplete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { isComplete } = req.body;
      const result = await this.roadmapService.toggleItemCompletion(
        req.params.itemId,
        req.user!.userId,
        isComplete
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  regenerate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const hoursPerWeek = req.body?.hoursPerWeek;
      const result = await this.roadmapService.regenerate(
        req.params.roadmapId,
        req.user!.userId,
        hoursPerWeek
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  exportPdf = async (_req: Request, res: Response): Promise<void> => {
    res.status(501).json({
      error: { code: "NOT_IMPLEMENTED", message: "PDF export is not yet available" },
    });
  };
}
