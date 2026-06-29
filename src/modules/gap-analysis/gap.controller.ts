import { Request, Response, NextFunction } from "express";
import { GapAnalysisService } from "./gap.service";

export class GapController {
  constructor(private gapService: GapAnalysisService) {}

  analyze = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.params.userId;
      const targetRole = req.query.targetRole as string;
      if (!targetRole) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "targetRole query param is required" } });
        return;
      }
      const result = await this.gapService.analyze(userId, targetRole);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
