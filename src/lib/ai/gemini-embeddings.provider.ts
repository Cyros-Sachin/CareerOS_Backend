import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../../config/env";
import { logger } from "../logger";
import type { EmbeddingService } from "./embeddings.interface";

export class GeminiEmbeddingProvider implements EmbeddingService {
  private model;

  constructor() {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
    this.model = genAI.getGenerativeModel({
      model: env.GEMINI_EMBEDDING_MODEL,
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    logger.debug({ textLength: text.length }, "Gemini embedding request");
    const result = await this.model.embedContent(text);
    const values = result.embedding.values;
    if (!values || values.length === 0) {
      throw new Error("Gemini embedding returned empty values");
    }
    return values;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const results = await Promise.all(
      texts.map((t) => this.generateEmbedding(t))
    );
    return results;
  }
}
