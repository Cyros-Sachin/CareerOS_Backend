import { query, queryOne } from "../../db/pool";

export interface ResumeRow {
  id: string;
  user_id: string;
  file_url: string;
  file_key: string;
  original_filename: string;
  file_size_bytes: number;
  mime_type: string;
  status: string;
  failure_reason: string | null;
  page_count: number | null;
  raw_text: string | null;
  parsed_data: Record<string, unknown> | null;
  ats_score: number | null;
  dimension_scores: Record<string, unknown> | null;
  suggestions: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function createResume(data: {
  userId: string;
  fileUrl: string;
  fileKey: string;
  originalFilename: string;
  fileSizeBytes: number;
  mimeType: string;
}): Promise<ResumeRow> {
  return (await queryOne<ResumeRow>(
    `INSERT INTO resumes (user_id, file_url, file_key, original_filename, file_size_bytes, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.userId, data.fileUrl, data.fileKey, data.originalFilename, data.fileSizeBytes, data.mimeType]
  ))!;
}

export async function findById(id: string): Promise<ResumeRow | null> {
  return queryOne<ResumeRow>("SELECT * FROM resumes WHERE id = $1", [id]);
}

export async function findByUser(userId: string): Promise<ResumeRow[]> {
  return query<ResumeRow>("SELECT * FROM resumes WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
}

export async function updateResumeStatus(id: string, status: string, failureReason?: string): Promise<void> {
  if (failureReason) {
    await query(
      `UPDATE resumes SET status = $1::resume_status, failure_reason = $2, updated_at = NOW() WHERE id = $3`,
      [status, failureReason, id]
    );
  } else {
    await query(
      `UPDATE resumes SET status = $1::resume_status, updated_at = NOW() WHERE id = $2`,
      [status, id]
    );
  }
}

export async function saveExtractedText(id: string, rawText: string, pageCount: number): Promise<void> {
  await query(
    `UPDATE resumes SET raw_text = $1, page_count = $2, updated_at = NOW() WHERE id = $3`,
    [rawText, pageCount, id]
  );
}

export async function saveScoredData(
  id: string,
  parsedData: Record<string, unknown>,
  scoringResult: { atsScore: number; dimensionScores: Record<string, unknown>; suggestions: string[] }
): Promise<void> {
  await query(
    `UPDATE resumes SET parsed_data = $1::jsonb, ats_score = $2, dimension_scores = $3::jsonb, suggestions = $4::jsonb, updated_at = NOW() WHERE id = $5`,
    [JSON.stringify(parsedData), scoringResult.atsScore, JSON.stringify(scoringResult.dimensionScores), JSON.stringify(scoringResult.suggestions), id]
  );
}

export async function insertScoreHistory(
  resumeId: string,
  userId: string,
  scoringResult: { atsScore: number; dimensionScores: Record<string, unknown> }
): Promise<void> {
  await query(
    `INSERT INTO resume_score_history (resume_id, user_id, ats_score, dimension_scores)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [resumeId, userId, scoringResult.atsScore, JSON.stringify(scoringResult.dimensionScores)]
  );
}

export async function getScoreHistory(userId: string, limit: number = 50): Promise<{
  resume_id: string;
  ats_score: number;
  dimension_scores: Record<string, unknown>;
  recorded_at: string;
}[]> {
  return query(
    `SELECT rsh.resume_id, rsh.ats_score, rsh.dimension_scores, rsh.recorded_at
     FROM resume_score_history rsh
     WHERE rsh.user_id = $1
     ORDER BY rsh.recorded_at DESC
     LIMIT $2`,
    [userId, limit]
  );
}

export async function setActiveResume(resumeId: string, userId: string): Promise<void> {
  await query("BEGIN");
  try {
    await query(
      `UPDATE resumes SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1 AND is_active = TRUE`,
      [userId]
    );
    await query(
      `UPDATE resumes SET is_active = TRUE, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
      [resumeId, userId]
    );
    await query("COMMIT");
  } catch (err) {
    await query("ROLLBACK");
    throw err;
  }
}

export async function deleteResume(id: string, userId: string): Promise<ResumeRow | null> {
  const row = await queryOne<ResumeRow>(
    `DELETE FROM resumes WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId]
  );
  return row;
}

export async function countScansForMonth(userId: string, billingCycleMonth: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM resume_scans
     WHERE user_id = $1 AND billing_cycle_month = $2`,
    [userId, billingCycleMonth]
  );
  return row ? parseInt(row.count, 10) : 0;
}

export async function insertScanRecord(userId: string, resumeId: string, billingCycleMonth: string): Promise<void> {
  await query(
    `INSERT INTO resume_scans (user_id, resume_id, billing_cycle_month) VALUES ($1, $2, $3)`,
    [userId, resumeId, billingCycleMonth]
  );
}

export async function getActiveResume(userId: string): Promise<ResumeRow | null> {
  return queryOne<ResumeRow>(
    "SELECT * FROM resumes WHERE user_id = $1 AND is_active = TRUE",
    [userId]
  );
}

export async function getRoleKeywordCountForUser(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>("SELECT COUNT(*)::text as count FROM role_keywords");
  return row ? parseInt(row.count, 10) : 0;
}

export async function getAllKeywords(): Promise<string[]> {
  const rows = await query<{ name: string }>("SELECT DISTINCT name FROM skills ORDER BY name");
  return rows.map((r) => r.name);
}

export function getCurrentBillingMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
