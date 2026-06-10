import { Router } from "express";

import {
  uploadResume,
  listResumes,
  getResumeById,
} from "./resume.controller";

import {
  authMiddleware,
} from "../../middleware/auth.middleware";

import {
  upload,
} from "../../config/multer";

const router = Router();

router.post(
  "/upload",
  authMiddleware,
  upload.single("resume"),
  uploadResume
);

router.get(
  "/",
  authMiddleware,
  listResumes
);
router.get(
  "/:id",
  authMiddleware,
  getResumeById
);

export default router;