import { query, queryOne } from "../../db/pool";

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string;
  is_cached_response: boolean;
  flagged_by_safety_filter: boolean;
  created_at: string;
}

export async function findOrCreateConversation(userId: string): Promise<ConversationRow> {
  const existing = await queryOne<ConversationRow>(
    "SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1",
    [userId]
  );
  if (existing) return existing;

  return (await queryOne<ConversationRow>(
    `INSERT INTO conversations (user_id) VALUES ($1) RETURNING *`,
    [userId]
  ))!;
}

export async function getConversation(conversationId: string, userId: string): Promise<ConversationRow | null> {
  return queryOne<ConversationRow>(
    "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
    [conversationId, userId]
  );
}

export async function getMessages(
  conversationId: string,
  limit = 50,
  offset = 0
): Promise<MessageRow[]> {
  return query<MessageRow>(
    `SELECT * FROM conversation_messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit, offset]
  );
}

export async function getRecentMessages(conversationId: string, count = 10): Promise<MessageRow[]> {
  return query<MessageRow>(
    `SELECT * FROM conversation_messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, count]
  );
}

export async function insertMessage(data: {
  conversationId: string;
  userId: string;
  role: string;
  content: string;
  isCachedResponse?: boolean;
  flaggedBySafetyFilter?: boolean;
}): Promise<MessageRow> {
  return (await queryOne<MessageRow>(
    `INSERT INTO conversation_messages (conversation_id, user_id, role, content, is_cached_response, flagged_by_safety_filter)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.conversationId,
      data.userId,
      data.role,
      data.content,
      data.isCachedResponse ?? false,
      data.flaggedBySafetyFilter ?? false,
    ]
  ))!;
}

export async function updateConversationTitle(conversationId: string, title: string): Promise<void> {
  await query(
    "UPDATE conversations SET title = $1 WHERE id = $2",
    [title, conversationId]
  );
}

export async function getDailyMentorCount(userId: string, dateStr: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM conversation_messages
     WHERE user_id = $1 AND role = 'assistant' AND is_cached_response = false
       AND TO_CHAR(created_at, 'YYYY-MM-DD') = $2`,
    [userId, dateStr]
  );
  return row ? parseInt(row.count, 10) : 0;
}
