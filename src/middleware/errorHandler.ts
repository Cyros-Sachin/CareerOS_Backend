import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export interface AppError {
  statusCode: number;
  code: string;
  message: string;
}

export class HttpError extends Error implements AppError {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");

  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
}
