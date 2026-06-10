import { Request, Response } from "express";

import {
  generateAccessToken,
  generateRefreshToken,
} from "../../utils/jwt";
import { AuthRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/prisma";

import {
  loginUser,
  registerUser,
  saveRefreshToken,
  refreshSession,
  logoutUser,
} from "./auth.service";

export async function register(
  req: Request,
  res: Response
) {
  try {
    const { email, password } =
      req.body;

    const user =
      await registerUser(
        email,
        password
      );

    res.status(201).json(user);
  } catch (err: any) {
    res.status(400).json({
      message: err.message,
    });
  }
}

export async function login(
  req: Request,
  res: Response
) {
  try {
    const { email, password } =
      req.body;

    const user =
      await loginUser(
        email,
        password
      );

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken =
      generateAccessToken(payload);

    const refreshToken =
      generateRefreshToken(payload);

    await saveRefreshToken(
      user.id,
      refreshToken
    );

    res.json({
      accessToken,
      refreshToken,
    });
  } catch (err: any) {
    res.status(400).json({
      message: err.message,
    });
  }
}

export async function me(
  req: AuthRequest,
  res: Response
) {
  try {
    const user =
      await prisma.user.findUnique({
        where: {
          id: req.user?.userId,
        },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

    res.json(user);
  } catch (err: any) {
    res.status(500).json({
      message: err.message,
    });
  }
}

export async function refresh(
  req: Request,
  res: Response
) {
  try {
    const { refreshToken } =
      req.body;

    const tokens =
      await refreshSession(
        refreshToken
      );

    res.json(tokens);
  } catch (err: any) {
    res.status(401).json({
      message: err.message,
    });
  }
}

export async function logout(
  req: Request,
  res: Response
) {
  try {
    const { refreshToken } =
      req.body;

    await logoutUser(
      refreshToken
    );

    res.json({
      message:
        "Logged out successfully",
    });
  } catch (err: any) {
    res.status(400).json({
      message: err.message,
    });
  }
}