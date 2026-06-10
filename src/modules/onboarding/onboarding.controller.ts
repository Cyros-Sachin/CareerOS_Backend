import {
  Request,
  Response,
} from "express";

import {
  saveOnboarding,
  getProfile,
} from "./onboarding.service";

import { AuthRequest }
  from "../../middleware/auth.middleware";

import { onboardingSchema }
  from "../../utils/validators";

export async function saveProfile(
  req: AuthRequest,
  res: Response
) {
  try {
    const parsed =
      onboardingSchema.parse(
        req.body
      );

    const profile =
      await saveOnboarding(
        req.user!.userId,
        parsed
      );

    res.json(profile);
  } catch (err: any) {
    res.status(400).json({
      message: err.message,
    });
  }
}

export async function profile(
  req: AuthRequest,
  res: Response
) {
  try {
    const data =
      await getProfile(
        req.user!.userId
      );

    res.json(data);
  } catch (err: any) {
    res.status(500).json({
      message: err.message,
    });
  }
}