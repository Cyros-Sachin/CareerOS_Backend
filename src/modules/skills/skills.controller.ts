import { Request, Response, NextFunction } from "express";
import { SkillsService } from "./skills.service";

export class SkillsController {
  constructor(private skillsService: SkillsService) {}

  browse = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const category = req.query.category as string | undefined;
      const search = req.query.search as string | undefined;
      const result = await this.skillsService.browse(category, search);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  getCategories = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.skillsService.getCategories();
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
