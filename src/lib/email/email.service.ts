export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export interface EmailService {
  sendEmail(payload: EmailPayload): Promise<void>;
}
