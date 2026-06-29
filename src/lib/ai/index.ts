import { env } from "../../config/env";
import type { ResumeParserService } from "./resume-parser.interface";
import { OpenAIProvider } from "./openai.provider";
import { GeminiProvider } from "./gemini.provider";

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

export const resumeParser: ResumeParserService = createResumeParser();
