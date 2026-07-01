import OpenAI from "openai";
import { env } from "../../config/env";
import { logger } from "../logger";
import type { MentorChatService, ChatMessage } from "./mentor-chat.interface";

export class OpenAIMentorProvider implements MentorChatService {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: env.OPENAI_TIMEOUT_MS,
      maxRetries: 2,
    });
  }

  async streamChat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    signal?: AbortSignal
  ): Promise<{ fullText: string }> {
    logger.info({ messageCount: messages.length }, "Calling OpenAI for mentor chat");

    const apiMessages = messages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
    }));

    const stream = await this.client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 2048,
      stream: true,
    });

    let fullText = "";
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) {
        fullText += text;
        onChunk(text);
      }
    }

    return { fullText };
  }
}
