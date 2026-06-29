import { env } from "../../config/env";
import type { ResumeParserService } from "./resume-parser.interface";
import { OpenAIProvider } from "./openai.provider";
import { GeminiProvider } from "./gemini.provider";
import type { EmbeddingService } from "./embeddings.interface";
import { GeminiEmbeddingProvider } from "./gemini-embeddings.provider";
import { OpenAIEmbeddingProvider } from "./openai-embeddings.provider";
import type { RoadmapGeneratorService } from "./roadmap-generator.interface";
import { GeminiRoadmapProvider } from "./gemini-roadmap.provider";
import { OpenAIRoadmapProvider } from "./openai-roadmap.provider";

function createResumeParser(): ResumeParserService {
  switch (env.AI_PROVIDER) {
    case "gemini":
      return new GeminiProvider();
    case "openai":
      return new OpenAIProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER: ${env.AI_PROVIDER}. Use "gemini" or "openai".`);
  }
}

export function createEmbeddingService(): EmbeddingService {
  switch (env.EMBEDDING_PROVIDER) {
    case "gemini":
      return new GeminiEmbeddingProvider();
    case "openai":
      return new OpenAIEmbeddingProvider();
    default:
      throw new Error(`Unknown EMBEDDING_PROVIDER: ${env.EMBEDDING_PROVIDER}. Use "gemini" or "openai".`);
  }
}

export function createRoadmapGenerator(): RoadmapGeneratorService {
  switch (env.AI_PROVIDER) {
    case "gemini":
      return new GeminiRoadmapProvider();
    case "openai":
      return new OpenAIRoadmapProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER: ${env.AI_PROVIDER}. Use "gemini" or "openai".`);
  }
}

export const resumeParser: ResumeParserService = createResumeParser();
