import { Router } from "express";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GoogleOAuthService } from "./google-oauth.service";
import { EmailService } from "../../lib/email/email.service";
import { validate } from "../../middleware/validate";
import { authenticate } from "../../middleware/authenticate";
import { rateLimiter } from "../../middleware/rateLimiter";
import {
  registerSchema,
  loginSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.validators";

export function createAuthRouter(emailService: EmailService): Router {
  const authService = new AuthService(emailService);
  const googleOAuthService = new GoogleOAuthService(authService);
  const controller = new AuthController(authService, googleOAuthService);

  const router = Router();

  const loginLimiter = rateLimiter({
    keyPrefix: "login",
    windowSeconds: 15 * 60,
    max: 10,
    keyFn: (req) => `ip:${req.ip}:email:${req.body?.email || "unknown"}`,
  });

  const registerLimiter = rateLimiter({
    keyPrefix: "register",
    windowSeconds: 60 * 60,
    max: 5,
  });

  const resendVerificationLimiter = rateLimiter({
    keyPrefix: "resend-verification",
    windowSeconds: 60 * 60,
    max: 3,
    keyFn: (req) => `email:${req.body?.email || "unknown"}`,
  });

  const forgotPasswordLimiter = rateLimiter({
    keyPrefix: "forgot-password",
    windowSeconds: 60 * 60,
    max: 5,
    keyFn: (req) => `ip:${req.ip}:email:${req.body?.email || "unknown"}`,
  });

  const resetPasswordLimiter = rateLimiter({
    keyPrefix: "reset-password",
    windowSeconds: 60 * 60,
    max: 10,
  });

  router.post("/register", registerLimiter, validate(registerSchema), controller.register);
  router.get("/verify-email", controller.verifyEmail);
  router.post("/resend-verification", resendVerificationLimiter, validate(resendVerificationSchema), controller.resendVerification);
  router.post("/login", loginLimiter, validate(loginSchema), controller.login);
  router.get("/google", controller.googleAuth);
  router.get("/google/callback", controller.googleCallback);
  router.post("/refresh", controller.refresh);
  router.post("/logout", authenticate, controller.logout);
  router.get("/me", authenticate, controller.me);
  router.post("/forgot-password", forgotPasswordLimiter, validate(forgotPasswordSchema), controller.forgotPassword);
  router.post("/reset-password", resetPasswordLimiter, validate(resetPasswordSchema), controller.resetPassword);

  return router;
}
