import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service";
import { GoogleOAuthService } from "./google-oauth.service";
import { env } from "../../config/env";
import { logger } from "../../lib/logger";

export class AuthController {
  constructor(
    private authService: AuthService,
    private googleOAuthService: GoogleOAuthService
  ) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.authService.register(req.body.email, req.body.password, req.body.name);
      res.status(201).json({
        message: "Registration successful. Please check your email to verify your account.",
      });
    } catch (err) {
      next(err);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.query.token as string;
      if (!token) {
        res.status(400).json({ error: { code: "MISSING_TOKEN", message: "Verification token is required" } });
        return;
      }
      await this.authService.verifyEmail(token);
      res.json({ message: "Email verified successfully. You can now log in." });
    } catch (err) {
      next(err);
    }
  };

  resendVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.authService.resendVerification(req.body.email);
      res.json({
        message: "If that email exists, a verification email has been sent.",
      });
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.authService.login(req.body.email, req.body.password);
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/api/auth",
      });
      res.json({
        accessToken: result.accessToken,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  };

  googleAuth = async (_req: Request, res: Response): Promise<void> => {
    const url = this.googleOAuthService.getAuthUrl();
    res.redirect(url);
  };

  googleCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const code = req.query.code as string;
      if (!code) {
        res.status(400).json({ error: { code: "MISSING_CODE", message: "Authorization code is required" } });
        return;
      }
      const result = await this.googleOAuthService.handleCallback(code);
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/api/auth",
      });
      res.json({
        accessToken: result.accessToken,
        user: result.user,
      });
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        res.status(401).json({ error: { code: "NO_REFRESH_TOKEN", message: "No refresh token provided" } });
        return;
      }
      const result = await this.authService.refresh(refreshToken);
      res.cookie("refreshToken", result.refreshToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/api/auth",
      });
      res.json({ accessToken: result.accessToken });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (refreshToken && req.user) {
        await this.authService.logout(req.user.userId, refreshToken);
      }
      res.clearCookie("refreshToken", { path: "/api/auth" });
      res.json({ message: "Logged out successfully" });
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.authService.getMe(req.user!.userId);
      res.json(profile);
    } catch (err) {
      next(err);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.authService.forgotPassword(req.body.email);
      res.json({
        message: "If that email exists, a password reset code has been sent.",
      });
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.authService.resetPassword(req.body.email, req.body.otp, req.body.newPassword);
      res.json({ message: "Password reset successfully. Please log in with your new password." });
    } catch (err) {
      next(err);
    }
  };
}
