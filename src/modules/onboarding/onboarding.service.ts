import { HttpError } from "../../middleware/errorHandler";
import * as repo from "./onboarding.repository";

export class OnboardingService {
  async getStatus(userId: string) {
    const status = await repo.getOnboardingStatus(userId);
    if (!status) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }
    return status;
  }

  async updateStep1(userId: string, data: {
    name?: string;
    college?: string | null;
    degree?: string | null;
    graduationYear?: number | null;
  }): Promise<void> {
    await repo.updateStep1(userId, data);
  }

  async updateStep2(userId: string, careerGoals: string[]): Promise<void> {
    await repo.updateStep2(userId, careerGoals);
  }

  async updateStep3(userId: string, workPreferences: string[], targetCompanies: string[]): Promise<void> {
    await repo.updateStep3(userId, workPreferences, targetCompanies);
  }

  async updateStep4(userId: string, skillLevel: string): Promise<void> {
    await repo.updateStep4(userId, skillLevel);
  }

  async complete(userId: string, _skippedResume: boolean): Promise<void> {
    const status = await repo.getOnboardingStatus(userId);
    if (!status) {
      throw new HttpError(404, "USER_NOT_FOUND", "User not found");
    }
    if (status.onboarding_step < 4) {
      throw new HttpError(400, "ONBOARDING_INCOMPLETE", "Complete all onboarding steps first");
    }
    await repo.completeOnboarding(userId);
  }
}
