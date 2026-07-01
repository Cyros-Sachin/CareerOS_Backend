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
import type { MentorChatService } from "./mentor-chat.interface";
import { GeminiMentorProvider } from "./gemini-mentor.provider";
import { OpenAIMentorProvider } from "./openai-mentor.provider";
import type { InterviewAIService } from "./interview-question-gen.interface";
import { GeminiInterviewProvider } from "./gemini-interview.provider";
import { OpenAIInterviewProvider } from "./openai-interview.provider";
import type { JobExtractionService } from "./job-extraction.interface";
import { GeminiJobExtractionProvider } from "./gemini-job-extraction.provider";
import { OpenAIJobExtractionProvider } from "./openai-job-extraction.provider";

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

export function createMentorChatService(): MentorChatService {
  switch (env.AI_PROVIDER) {
    case "gemini":
      return new GeminiMentorProvider();
    case "openai":
      return new OpenAIMentorProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER: ${env.AI_PROVIDER}. Use "gemini" or "openai".`);
  }
}

export function createJobExtractionService(): JobExtractionService {
  switch (env.AI_PROVIDER) {
    case "gemini":
      return new GeminiJobExtractionProvider();
    case "openai":
      return new OpenAIJobExtractionProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER: ${env.AI_PROVIDER}. Use "gemini" or "openai".`);
  }
}

export function createInterviewAI(): InterviewAIService {
  switch (env.AI_PROVIDER) {
    case "gemini":
      return new GeminiInterviewProvider();
    case "openai":
      return new OpenAIInterviewProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER: ${env.AI_PROVIDER}. Use "gemini" or "openai".`);
  }
}

export const resumeParser: ResumeParserService = createResumeParser();
