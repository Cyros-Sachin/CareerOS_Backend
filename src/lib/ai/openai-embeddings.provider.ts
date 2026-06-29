import OpenAI from "openai";
import { env } from "../../config/env";
import { logger } from "../logger";
import type { EmbeddingService } from "./embeddings.interface";

export class OpenAIEmbeddingProvider implements EmbeddingService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_TIMEOUT_MS,
      maxRetries: 2,
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    logger.debug({ textLength: text.length }, "OpenAI embedding request");
    const response = await this.client.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0].embedding;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  }
}
