import { prisma } from "../../config/prisma";

import {
  hashPassword,
  verifyPassword,
} from "../../utils/hash";

import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from "../../utils/jwt";

export async function registerUser(
  email: string,
  password: string
) {
  const existing =
    await prisma.user.findUnique({
      where: { email },
    });

  if (existing) {
    throw new Error(
      "User already exists"
    );
  }

  const passwordHash =
    await hashPassword(password);

  return prisma.user.create({
    data: {
      email,
      passwordHash,
    },
  });
}

export async function loginUser(
  email: string,
  password: string
) {
  const user =
    await prisma.user.findUnique({
      where: { email },
    });

  if (!user) {
    throw new Error(
      "Invalid credentials"
    );
  }

  const valid =
    await verifyPassword(
      user.passwordHash,
      password
    );

  if (!valid) {
    throw new Error(
      "Invalid credentials"
    );
  }

  return user;
}

export async function saveRefreshToken(
  userId: string,
  token: string
) {
  return prisma.refreshToken.create({
    data: {
      userId,
      token,
      expiresAt: new Date(
        Date.now() +
          7 * 24 * 60 * 60 * 1000
      ),
    },
  });
}

export async function refreshSession(
  refreshToken: string
) {
  const tokenInDb =
    await prisma.refreshToken.findUnique({
      where: {
        token: refreshToken,
      },
      include: {
        user: true,
      },
    });

  if (!tokenInDb) {
    throw new Error(
      "Invalid refresh token"
    );
  }

  try {
    verifyToken(refreshToken);
  } catch {
    throw new Error(
      "Expired refresh token"
    );
  }

  await prisma.refreshToken.delete({
    where: {
      token: refreshToken,
    },
  });

  const payload = {
    userId: tokenInDb.user.id,
    email: tokenInDb.user.email,
    role: tokenInDb.user.role,
  };

  const accessToken =
    generateAccessToken(payload);

  const newRefreshToken =
    generateRefreshToken(payload);

  await saveRefreshToken(
    tokenInDb.user.id,
    newRefreshToken
  );

  return {
    accessToken,
    refreshToken:
      newRefreshToken,
  };
}

export async function logoutUser(
  refreshToken: string
) {
  return prisma.refreshToken.deleteMany({
    where: {
      token: refreshToken,
    },
  });
}