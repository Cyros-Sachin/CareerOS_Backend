import { logger } from "../../lib/logger";
import { redis } from "../../lib/redis";
import { HttpError } from "../../middleware/errorHandler";
import * as repo from "./mentor.repository";
import * as userRepo from "../auth/auth.repository";
import * as resumeRepo from "../resume/resume.repository";
import { MentorChatService, MENTOR_SYSTEM_PROMPT_BASE } from "../../lib/ai/mentor-chat.interface";
import { checkContentSafety } from "../../lib/ai/content-safety";
import { GithubAuditService } from "./github-audit.service";
import crypto from "crypto";

const SUGGESTED_PROMPTS = [
  "What skills should I focus on to become a software engineer?",
  "How can I improve my resume for FAANG companies?",
  "What projects should I build to stand out?",
  "How do I prepare for technical interviews?",
  "Should I focus on frontend or backend development?",
  "How do I choose between a startup and a big company?",
];

export class MentorService {
  private githubAuditService = new GithubAuditService();

  constructor(private mentorChat: MentorChatService) {}

  async getHistory(userId: string, limit = 50) {
    const conversation = await repo.findOrCreateConversation(userId);
    const messages = await repo.getMessages(conversation.id, limit);
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      isCachedResponse: m.is_cached_response,
      createdAt: m.created_at,
    }));
  }

  async getSuggestedPrompts(userId: string) {
    const user = await userRepo.findById(userId);
    if (user?.career_goals && user.career_goals.length > 0) {
      const goal = user.career_goals[0];
      return [
        `What skills do I need for ${goal}?`,
        `How can I tailor my resume for ${goal} roles?`,
        ...SUGGESTED_PROMPTS.slice(2),
      ];
    }
    return SUGGESTED_PROMPTS;
  }

  async chat(
    userId: string,
    message: string,
    onChunk: (text: string) => void
  ): Promise<string> {
    const user = await userRepo.findById(userId);
    if (!user) throw new HttpError(404, "USER_NOT_FOUND", "User not found");

    const tier = user.subscription_tier || "free";
    const today = new Date().toISOString().slice(0, 10);

    if (tier !== "pro") {
      const dailyLimit = tier === "student" ? 100 : 10;
      const count = await repo.getDailyMentorCount(userId, today);
      if (count >= dailyLimit) {
        throw new HttpError(429, "MENTOR_LIMIT_REACHED", `Daily message limit (${dailyLimit}) reached. Upgrade to Pro for unlimited access.`);
      }
    }

    const safetyCheck = checkContentSafety(message);
    if (safetyCheck.flagged) {
      const conversation = await repo.findOrCreateConversation(userId);
      await repo.insertMessage({
        conversationId: conversation.id,
        userId,
        role: "user",
        content: message,
        flaggedBySafetyFilter: true,
      });
      await repo.insertMessage({
        conversationId: conversation.id,
        userId,
        role: "assistant",
        content: safetyCheck.response!,
        flaggedBySafetyFilter: true,
      });
      return safetyCheck.response!;
    }

    const normalizedMessage = message.toLowerCase().trim();
    const cacheKey = `mentor:cache:${userId}:${crypto.createHash("sha256").update(normalizedMessage).digest("hex")}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const conversation = await repo.findOrCreateConversation(userId);
        await repo.insertMessage({
          conversationId: conversation.id,
          userId,
          role: "user",
          content: message,
          isCachedResponse: false,
        });
        await repo.insertMessage({
          conversationId: conversation.id,
          userId,
          role: "assistant",
          content: cached,
          isCachedResponse: true,
        });

        const chunkSize = 100;
        for (let i = 0; i < cached.length; i += chunkSize) {
          onChunk(cached.slice(i, i + chunkSize));
        }
        return cached;
      }
    } catch (err) {
      logger.warn({ err }, "Cache lookup failed, proceeding without cache");
    }

    const conversation = await repo.findOrCreateConversation(userId);
    await repo.insertMessage({
      conversationId: conversation.id,
      userId,
      role: "user",
      content: message,
    });

    const resume = await resumeRepo.getActiveResume(userId);

    let systemPrompt = MENTOR_SYSTEM_PROMPT_BASE;

    systemPrompt += `\n\n## User Profile
- Name: ${user.name}
- College: ${user.college ?? "Not set"}
- Degree: ${user.degree ?? "Not set"}
- Graduation Year: ${user.graduation_year ?? "Not set"}
- Career Goals: ${(user.career_goals ?? []).join(", ") || "Not specified"}
- Skill Level: ${user.skill_level ?? "Not specified"}
- Subscription Tier: ${tier}`;

    if (resume?.parsed_data) {
      const pd = resume.parsed_data as Record<string, unknown>;
      const skills = Array.isArray(pd.skills) ? pd.skills.join(", ") : "None listed";
      const projects = Array.isArray(pd.projects)
        ? (pd.projects as Array<Record<string, unknown>>).map((p: Record<string, unknown>) => `- ${p.name}: ${p.description}`).join("\n")
        : "None listed";
      const education = Array.isArray(pd.education)
        ? (pd.education as Array<Record<string, unknown>>).map((e: Record<string, unknown>) => `- ${e.institution}, ${e.degree} in ${e.field}`).join("\n")
        : "None listed";

      systemPrompt += `\n\n## Active Resume
### Skills
${skills}

### Education
${education}

### Projects
${projects}`;
    }

    const recentMessages = await repo.getRecentMessages(conversation.id, 10);
    recentMessages.reverse();

    const chatMessages = [
      { role: "system" as const, content: systemPrompt },
      ...recentMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    const { fullText } = await this.mentorChat.streamChat(chatMessages, onChunk);

    await repo.insertMessage({
      conversationId: conversation.id,
      userId,
      role: "assistant",
      content: fullText,
    });

    try {
      await redis.set(cacheKey, fullText, "EX", 86400);
    } catch (err) {
      logger.warn({ err }, "Cache write failed");
    }

    if (!conversation.title) {
      const title = message.length > 100 ? message.slice(0, 97) + "..." : message;
      await repo.updateConversationTitle(conversation.id, title).catch(() => {});
    }

    return fullText;
  }

  async githubAudit(_userId: string, githubUrl: string): Promise<Record<string, unknown>> {
    return this.githubAuditService.audit(githubUrl);
  }
}
