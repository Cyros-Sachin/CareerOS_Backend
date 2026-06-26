import { Request, Response, NextFunction } from "express";
import { OnboardingService } from "./onboarding.service";

export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  getStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const status = await this.onboardingService.getStatus(req.user!.userId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  };

  updateStep1 = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.onboardingService.updateStep1(req.user!.userId, req.body);
      res.json({ message: "Step 1 saved" });
    } catch (err) {
      next(err);
    }
  };

  updateStep2 = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.onboardingService.updateStep2(req.user!.userId, req.body.careerGoals);
      res.json({ message: "Step 2 saved" });
    } catch (err) {
      next(err);
    }
  };

  updateStep3 = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.onboardingService.updateStep3(req.user!.userId, req.body.workPreferences, req.body.targetCompanies);
      res.json({ message: "Step 3 saved" });
    } catch (err) {
      next(err);
    }
  };

  updateStep4 = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.onboardingService.updateStep4(req.user!.userId, req.body.skillLevel);
      res.json({ message: "Step 4 saved" });
    } catch (err) {
      next(err);
    }
  };

  complete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.onboardingService.complete(req.user!.userId, req.body.skippedResume);
      res.json({ message: "Onboarding completed!" });
    } catch (err) {
      next(err);
    }
  };
}
