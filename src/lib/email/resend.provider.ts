import { Resend } from "resend";
import { env } from "../../config/env";
import { logger } from "../logger";
import { EmailService, EmailPayload } from "./email.service";

export class ResendProvider implements EmailService {
  private client: Resend;

  constructor() {
    this.client = new Resend(env.RESEND_API_KEY || "re_placeholder");
  }

  async sendEmail(payload: EmailPayload): Promise<void> {
    try {
      await this.client.emails.send({
        from: "support@revoras.tech",
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
      });
      logger.info({ to: payload.to, subject: payload.subject }, "we are sending Email sent via Resend");
    } catch (err) {
      logger.error({ err, to: payload.to }, "Failed to send email via Resend");
      throw new Error("Failed to send email");
    }
  }
}
