import { query, queryOne } from "../../db/pool";

export interface OnboardingStatus {
  onboarding_step: number;
  onboarding_completed: boolean;
  name: string;
  college: string | null;
  degree: string | null;
  graduation_year: number | null;
  career_goals: string[];
  work_preferences: string[];
  target_companies: string[];
  skill_level: string | null;
}

export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus | null> {
  return queryOne<OnboardingStatus>(
    `SELECT onboarding_step, onboarding_completed, name, college, degree,
            graduation_year, career_goals, work_preferences, target_companies, skill_level
     FROM users WHERE id = $1`,
    [userId]
  );
}

export async function updateStep1(userId: string, data: {
  name?: string;
  college?: string | null;
  degree?: string | null;
  graduationYear?: number | null;
}): Promise<void> {
  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(data.name);
  }
  if (data.college !== undefined) {
    sets.push(`college = $${idx++}`);
    values.push(data.college);
  }
  if (data.degree !== undefined) {
    sets.push(`degree = $${idx++}`);
    values.push(data.degree);
  }
  if (data.graduationYear !== undefined) {
    sets.push(`graduation_year = $${idx++}`);
    values.push(data.graduationYear);
  }

  if (sets.length === 0) return;

  sets.push(`onboarding_step = GREATEST(onboarding_step, 1)`);
  values.push(userId);

  await query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${idx}`,
    values
  );
}

export async function updateStep2(userId: string, careerGoals: string[]): Promise<void> {
  await query(
    `UPDATE users SET career_goals = $1, onboarding_step = GREATEST(onboarding_step, 2)
     WHERE id = $2`,
    [careerGoals, userId]
  );
}

export async function updateStep3(userId: string, workPreferences: string[], targetCompanies: string[]): Promise<void> {
  await query(
    `UPDATE users SET work_preferences = $1, target_companies = $2, onboarding_step = GREATEST(onboarding_step, 3)
     WHERE id = $3`,
    [workPreferences, targetCompanies, userId]
  );
}

export async function updateStep4(userId: string, skillLevel: string): Promise<void> {
  await query(
    `UPDATE users SET skill_level = $1::skill_level, onboarding_step = GREATEST(onboarding_step, 4)
     WHERE id = $2`,
    [skillLevel, userId]
  );
}

export async function completeOnboarding(userId: string): Promise<void> {
  await query(
    `UPDATE users SET onboarding_completed = TRUE WHERE id = $1`,
    [userId]
  );
}
