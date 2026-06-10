import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir =
  path.join(
    process.cwd(),
    "uploads",
    "resumes"
  );

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, {
    recursive: true,
  });
}

const storage =
  multer.diskStorage({
    destination: (
      req,
      file,
      cb
    ) => {
      cb(null, uploadDir);
    },

    filename: (
      req,
      file,
      cb
    ) => {
      const unique =
        Date.now() +
        "-" +
        Math.round(
          Math.random() * 1e9
        );

      cb(
        null,
        unique +
          path.extname(
            file.originalname
          )
      );
    },
  });

export const upload =
  multer({
    storage,

    limits: {
      fileSize:
        10 * 1024 * 1024,
    },

    fileFilter: (
      req,
      file,
      cb
    ) => {
      const allowed = [
        ".pdf",
        ".docx",
      ];

      const ext =
        path.extname(
          file.originalname
        );

      if (
        allowed.includes(
          ext.toLowerCase()
        )
      ) {
        cb(null, true);
      } else {
        cb(
          new Error(
            "Only PDF/DOCX allowed"
          )
        );
      }
    },
  });