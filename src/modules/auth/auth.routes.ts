import { Router } from "express";

import {
  login,
  register,
  me,
  refresh,
  logout,
} from "./auth.controller";

import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.post(
  "/register",
  register
);

router.post(
  "/login",
  login
);

router.post(
  "/refresh",
  refresh
);

router.post(
  "/logout",
  logout
);

router.get(
  "/me",
  authMiddleware,
  me
);

export default router;