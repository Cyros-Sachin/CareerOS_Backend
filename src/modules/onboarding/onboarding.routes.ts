import { Router } from "express";

import {
  saveProfile,
  profile,
} from "./onboarding.controller";

import {
  authMiddleware,
} from "../../middleware/auth.middleware";

const router = Router();

router.post(
  "/",
  authMiddleware,
  saveProfile
);

router.get(
  "/",
  authMiddleware,
  profile
);

export default router;