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

export function createResumeParsingWorker(processor: (job: any) => Promise<void>) {
  return new Worker("resume-parsing", processor, {
    connection,
    concurrency: 2,
    lockDuration: 120000,
  });
}
