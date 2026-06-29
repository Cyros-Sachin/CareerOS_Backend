import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

function createS3Client(): S3Client | null {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    return null;
  }
  return new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

export const s3Client = createS3Client();

function getBucket(): string {
  return env.S3_BUCKET_NAME;
}

export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds: number = 900
): Promise<string> {
  if (!s3Client) {
    throw new Error("S3 not configured — set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION");
  }

  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function getDownloadUrl(
  key: string,
  expiresInSeconds: number = 900
): Promise<string> {
  if (!s3Client) {
    throw new Error("S3 not configured — set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION");
  }

  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  if (!s3Client) {
    throw new Error("S3 not configured — set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION");
  }

  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  const response = await s3Client.send(command);
  const body = await response.Body?.transformToByteArray();
  return Buffer.from(body || []);
}

export async function deleteObject(key: string): Promise<void> {
  if (!s3Client) {
    throw new Error("S3 not configured — set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION");
  }

  const command = new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });

  await s3Client.send(command);
}

export function buildResumeKey(userId: string, resumeId: string, extension: string): string {
  return `resumes/${userId}/${resumeId}.${extension}`;
}

export function getFileExtension(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "pdf";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    default:
      return "bin";
  }
}
