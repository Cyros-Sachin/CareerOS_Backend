import { query, queryOne } from "../../db/pool";

export interface InterviewSessionRow {
  id: string;
  user_id: string;
  mode: string;
  difficulty: string | null;
  topic: string | null;
  target_role: string;
  status: string;
  time_limit_seconds: number;
  total_score: number | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface InterviewQuestionRow {
  id: string;
  session_id: string;
  question_order: number;
  question_text: string;
  language: string | null;
  created_at: string;
}

export interface InterviewAnswerRow {
  id: string;
  question_id: string;
  session_id: string;
  answer_text: string | null;
  last_autosaved_at: string | null;
  submitted_at: string | null;
  submitted_late: boolean;
  score: Record<string, number> | null;
  feedback: string | null;
  model_answer: string | null;
  created_at: string;
}

export async function createSession(data: {
  userId: string;
  mode: string;
  difficulty: string | null;
  topic: string | null;
  targetRole: string;
  timeLimitSeconds: number;
}): Promise<InterviewSessionRow> {
  return (await queryOne<InterviewSessionRow>(
    `INSERT INTO interview_sessions (user_id, mode, difficulty, topic, target_role, time_limit_seconds)
     VALUES ($1, $2::interview_mode, $3::interview_difficulty, $4, $5, $6)
     RETURNING *`,
    [data.userId, data.mode, data.difficulty, data.topic, data.targetRole, data.timeLimitSeconds]
  ))!;
}

export async function findSessionById(id: string): Promise<InterviewSessionRow | null> {
  return queryOne<InterviewSessionRow>("SELECT * FROM interview_sessions WHERE id = $1", [id]);
}

export async function findSessionForUser(sessionId: string, userId: string): Promise<InterviewSessionRow | null> {
  return queryOne<InterviewSessionRow>(
    "SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2",
    [sessionId, userId]
  );
}

export async function insertQuestions(questions: Array<{
  sessionId: string;
  questionOrder: number;
  questionText: string;
  language: string | null;
}>): Promise<void> {
  if (questions.length === 0) return;

  const values = questions.map((_, i) => {
    const base = i * 4;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  }).join(", ");

  const params = questions.flatMap((q) => [
    q.sessionId,
    q.questionOrder,
    q.questionText,
    q.language,
  ]);

  await query(
    `INSERT INTO interview_questions (session_id, question_order, question_text, language)
     VALUES ${values}`,
    params
  );
}

export async function getQuestionsBySession(sessionId: string): Promise<InterviewQuestionRow[]> {
  return query<InterviewQuestionRow>(
    "SELECT * FROM interview_questions WHERE session_id = $1 ORDER BY question_order ASC",
    [sessionId]
  );
}

export async function findQuestionById(questionId: string): Promise<InterviewQuestionRow | null> {
  return queryOne<InterviewQuestionRow>("SELECT * FROM interview_questions WHERE id = $1", [questionId]);
}

export async function findOrCreateAnswer(questionId: string, sessionId: string): Promise<InterviewAnswerRow> {
  const existing = await queryOne<InterviewAnswerRow>(
    "SELECT * FROM interview_answers WHERE question_id = $1",
    [questionId]
  );
  if (existing) return existing;

  return (await queryOne<InterviewAnswerRow>(
    `INSERT INTO interview_answers (question_id, session_id)
     VALUES ($1, $2)
     ON CONFLICT (question_id) DO NOTHING
     RETURNING *`,
    [questionId, sessionId]
  ))!;
}

export async function autosaveAnswer(questionId: string, answerText: string): Promise<void> {
  await query(
    `INSERT INTO interview_answers (question_id, session_id, answer_text, last_autosaved_at)
     VALUES ($1, (SELECT session_id FROM interview_questions WHERE id = $1), $2, NOW())
     ON CONFLICT (question_id)
     DO UPDATE SET answer_text = $2, last_autosaved_at = NOW()`,
    [questionId, answerText]
  );
}

export async function submitAnswer(data: {
  questionId: string;
  answerText: string;
  submittedLate: boolean;
  score: Record<string, number>;
  feedback: string;
  modelAnswer: string;
}): Promise<InterviewAnswerRow> {
  return (await queryOne<InterviewAnswerRow>(
    `INSERT INTO interview_answers (question_id, session_id, answer_text, submitted_at, submitted_late, score, feedback, model_answer)
     VALUES ($1, (SELECT session_id FROM interview_questions WHERE id = $1), $2, NOW(), $3, $4::jsonb, $5, $6)
     ON CONFLICT (question_id)
     DO UPDATE SET answer_text = $2, submitted_at = NOW(), submitted_late = $3, score = $4::jsonb, feedback = $5, model_answer = $6
     RETURNING *`,
    [data.questionId, data.answerText, data.submittedLate, JSON.stringify(data.score), data.feedback, data.modelAnswer]
  ))!;
}

export async function getAnswersBySession(sessionId: string): Promise<InterviewAnswerRow[]> {
  return query<InterviewAnswerRow>(
    "SELECT * FROM interview_answers WHERE session_id = $1 ORDER BY created_at ASC",
    [sessionId]
  );
}

export async function completeSession(sessionId: string, totalScore: number): Promise<void> {
  await query(
    `UPDATE interview_sessions SET status = 'completed', total_score = $1, completed_at = NOW()
     WHERE id = $2`,
    [totalScore, sessionId]
  );
}

export async function abandonSession(sessionId: string): Promise<void> {
  await query(
    `UPDATE interview_sessions SET status = 'abandoned' WHERE id = $1 AND status = 'in_progress'`,
    [sessionId]
  );
}

export async function getUserSessions(userId: string, limit: number = 20): Promise<InterviewSessionRow[]> {
  return query<InterviewSessionRow>(
    `SELECT * FROM interview_sessions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
}

export async function getSessionWithDetails(sessionId: string): Promise<{
  session: InterviewSessionRow | null;
  questions: InterviewQuestionRow[];
  answers: InterviewAnswerRow[];
}> {
  const session = await findSessionById(sessionId);
  if (!session) return { session: null, questions: [], answers: [] };

  const [questions, answers] = await Promise.all([
    getQuestionsBySession(sessionId),
    getAnswersBySession(sessionId),
  ]);

  return { session, questions, answers };
}

export async function countSubmittedAnswers(sessionId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    "SELECT COUNT(*)::text as count FROM interview_answers WHERE session_id = $1 AND submitted_at IS NOT NULL",
    [sessionId]
  );
  return row ? parseInt(row.count, 10) : 0;
}
