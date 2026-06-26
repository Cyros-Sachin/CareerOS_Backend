import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env";
import { signAccessToken } from "../../lib/jwt";
import { AuthService } from "./auth.service";
import * as repo from "./auth.repository";
import { logger } from "../../lib/logger";

interface GoogleProfile {
  id: string;
  email: string;
  name: string;
}

export class GoogleOAuthService {
  private client: OAuth2Client;

  constructor(private authService: AuthService) {
    this.client = new OAuth2Client(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_CALLBACK_URL
    );
  }

  getAuthUrl(): string {
    return this.client.generateAuthUrl({
      access_type: "offline",
      scope: ["openid", "email", "profile"],
    });
  }

  async handleCallback(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; name: string; role: string };
  }> {
    const { tokens } = await this.client.getToken(code);
    if (!tokens.id_token) {
      throw new Error("No id_token received from Google");
    }

    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new Error("Invalid Google token payload");
    }

    const profile: GoogleProfile = {
      id: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name || payload.email.split("@")[0],
    };

    let user = await repo.findByGoogleId(profile.id);
    if (user) {
      return this.signInUser(user);
    }

    const existingByEmail = await repo.findByEmail(profile.email);
    if (existingByEmail) {
      const { query } = await import("../../db/pool");
      await query(
        `UPDATE users SET google_id = $1, email_verified = TRUE WHERE id = $2`,
        [profile.id, existingByEmail.id]
      );
      const updatedUser = await repo.findById(existingByEmail.id);
      return this.signInUser(updatedUser!);
    }

    user = await repo.createUser({
      email: profile.email,
      passwordHash: null,
      name: profile.name,
      googleId: profile.id,
    });

    await repo.markEmailVerified(user.id);

    return this.signInUser(user);
  }

  private async signInUser(user: repo.UserRow) {
    const { rawToken } = await this.authService.createAndStoreRefreshToken(user.id);
    const accessToken = signAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken: rawToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }
}
