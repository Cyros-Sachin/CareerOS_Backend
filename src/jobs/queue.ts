import { Queue, Worker, ConnectionOptions } from "bullmq";
import { redis } from "../lib/redis";

const connection: ConnectionOptions = {
  host: redis.options.host!,
  port: redis.options.port!,
  password: redis.options.password,
  db: redis.options.db,
  maxRetriesPerRequest: null,
};

export const resumeParsingQueue = new Queue("resume-parsing", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const jobIngestionQueue = new Queue("job-ingestion", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "fixed",
      delay: 60000,
    },
    removeOnComplete: 50,
    removeOnFail: 20,
  },
});

export function createResumeParsingWorker(processor: (job: any) => Promise<void>) {
  return new Worker("resume-parsing", processor, {
    connection,
    concurrency: 2,
    lockDuration: 120000,
  });
}

export function createJobIngestionWorker(processor: (job: any) => Promise<void>) {
  return new Worker("job-ingestion", processor, {
    connection,
    concurrency: 1,
    lockDuration: 300000,
  });
}

export const billingExpiryQueue = new Queue("billing-expiry", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "fixed", delay: 60000 },
    removeOnComplete: 10,
    removeOnFail: 10,
  },
});

export function createBillingExpiryWorker(processor: (job: any) => Promise<void>) {
  return new Worker("billing-expiry", processor, {
    connection,
    concurrency: 1,
    lockDuration: 120000,
  });
}
