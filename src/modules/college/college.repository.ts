import { query, queryOne } from "../../db/pool";

export interface InstitutionRow {
  id: string;
  name: string;
  domain: string | null;
  contact_email: string;
  created_at: string;
}

export interface BatchRow {
  id: string;
  institution_id: string;
  degree: string;
  graduation_year: number;
  label: string | null;
  created_at: string;
}

export interface BatchListRow extends BatchRow {
  student_count: number;
}

export async function findInstitutionByDomain(domain: string): Promise<InstitutionRow | null> {
  return queryOne<InstitutionRow>(
    "SELECT * FROM institutions WHERE domain = $1",
    [domain]
  );
}

export async function setUserInstitution(userId: string, institutionId: string): Promise<void> {
  await query("UPDATE users SET institution_id = $1 WHERE id = $2", [institutionId, userId]);
}

export async function getUserInstitutionInfo(userId: string): Promise<{
  institution_id: string | null;
  degree: string | null;
  graduation_year: number | null;
} | null> {
  return queryOne(
    "SELECT institution_id, degree, graduation_year FROM users WHERE id = $1",
    [userId]
  );
}

export async function findBatchByInstitutionDegreeYear(
  institutionId: string,
  degree: string,
  graduationYear: number
): Promise<BatchRow | null> {
  return queryOne<BatchRow>(
    `SELECT * FROM institution_batches
     WHERE institution_id = $1 AND degree = $2 AND graduation_year = $3
     LIMIT 1`,
    [institutionId, degree, graduationYear]
  );
}

export async function setUserBatch(userId: string, batchId: string): Promise<void> {
  await query("UPDATE users SET batch_id = $1 WHERE id = $2", [batchId, userId]);
}

export async function findInstitutionById(id: string): Promise<InstitutionRow | null> {
  return queryOne<InstitutionRow>("SELECT * FROM institutions WHERE id = $1", [id]);
}

export async function createBatch(data: {
  institutionId: string;
  degree: string;
  graduationYear: number;
  label?: string | null;
}): Promise<BatchRow> {
  return (await queryOne<BatchRow>(
    `INSERT INTO institution_batches (institution_id, degree, graduation_year, label)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [data.institutionId, data.degree, data.graduationYear, data.label || null]
  ))!;
}

export async function backfillBatchId(data: {
  batchId: string;
  institutionId: string;
  degree: string;
  graduationYear: number;
}): Promise<void> {
  await query(
    `UPDATE users SET batch_id = $1
     WHERE institution_id = $2
       AND degree = $3
       AND graduation_year = $4
       AND batch_id IS NULL`,
    [data.batchId, data.institutionId, data.degree, data.graduationYear]
  );
}

export async function getBatchesByInstitution(institutionId: string): Promise<BatchListRow[]> {
  return query<BatchListRow>(
    `SELECT b.*, COUNT(u.id)::int AS student_count
     FROM institution_batches b
     LEFT JOIN users u ON u.batch_id = b.id
     WHERE b.institution_id = $1
     GROUP BY b.id
     ORDER BY b.graduation_year DESC, b.degree`,
    [institutionId]
  );
}

export async function findBatchById(batchId: string): Promise<BatchRow | null> {
  return queryOne<BatchRow>("SELECT * FROM institution_batches WHERE id = $1", [batchId]);
}

export async function getBatchHeadcount(batchId: string): Promise<{
  total_linked: number;
  consenting: number;
}> {
  const row = await queryOne<{ total_linked: number; consenting: number }>(
    `SELECT
       COUNT(*)::int AS total_linked,
       COUNT(*) FILTER (WHERE institution_data_sharing_consent = true)::int AS consenting
     FROM users WHERE batch_id = $1`,
    [batchId]
  );
  return row!;
}

export async function getOnboardingCompletionRate(batchId: string): Promise<number> {
  const row = await queryOne<{ rate: number }>(
    `SELECT
       COALESCE(
         COUNT(*) FILTER (WHERE onboarding_completed = true)::float /
         NULLIF(COUNT(*), 0) * 100, 0
       ) AS rate
     FROM users
     WHERE batch_id = $1 AND institution_data_sharing_consent = true`,
    [batchId]
  );
  return row!.rate;
}

export async function getResumeAnalytics(batchId: string): Promise<{
  upload_rate_pct: number;
  avg_ats_score: number | null;
  dimension_scores: Record<string, number> | null;
}> {
  const rows = await query<{
    ats_score: number | null;
    dimension_scores: Record<string, any> | null;
  }>(
    `SELECT r.ats_score, r.dimension_scores
     FROM users u
     LEFT JOIN LATERAL (
       SELECT ats_score, dimension_scores FROM resumes
       WHERE user_id = u.id AND is_active = true
       ORDER BY updated_at DESC LIMIT 1
     ) r ON true
     WHERE u.batch_id = $1 AND u.institution_data_sharing_consent = true`,
    [batchId]
  );

  if (rows.length === 0) return { upload_rate_pct: 0, avg_ats_score: null, dimension_scores: null };

  const withResume = rows.filter((r) => r.ats_score !== null);
  const uploadRate = (withResume.length / rows.length) * 100;
  const avgAts = withResume.length > 0
    ? Math.round(withResume.reduce((s, r) => s + (r.ats_score ?? 0), 0) / withResume.length)
    : null;

  const dimKeys = new Set<string>();
  withResume.forEach((r) => {
    if (r.dimension_scores) Object.keys(r.dimension_scores).forEach((k) => dimKeys.add(k));
  });

  let avgDims: Record<string, number> | null = null;
  if (dimKeys.size > 0 && withResume.length > 0) {
    avgDims = {};
    for (const key of dimKeys) {
      const vals = withResume
        .map((r) => (r.dimension_scores as any)?.[key]?.raw ?? r.dimension_scores?.[key])
        .filter((v): v is number => v !== null && v !== undefined);
      avgDims[key] = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
    }
  }

  return { upload_rate_pct: Math.round(uploadRate), avg_ats_score: avgAts, dimension_scores: avgDims };
}

export async function getRoadmapAnalytics(batchId: string): Promise<number> {
  const row = await queryOne<{ avg_pct: number }>(
    `SELECT COALESCE(
       AVG(sub.completion_pct), 0
     ) AS avg_pct FROM (
       SELECT
         CASE WHEN COUNT(ri.id) = 0 THEN 0
         ELSE COUNT(ri.id) FILTER (WHERE ri.is_complete)::float / COUNT(ri.id) * 100
         END AS completion_pct
       FROM users u
       LEFT JOIN roadmaps rm ON rm.user_id = u.id AND rm.status = 'active'
       LEFT JOIN roadmap_items ri ON ri.roadmap_id = rm.id
       WHERE u.batch_id = $1 AND u.institution_data_sharing_consent = true
       GROUP BY u.id
     ) sub`,
    [batchId]
  );
  return Math.round(row!.avg_pct);
}

export async function getInterviewAnalytics(batchId: string): Promise<{
  sessions_completed: number;
  avg_total_score: number | null;
}> {
  const row = await queryOne<{
    sessions_completed: number;
    avg_total_score: number | null;
  }>(
    `SELECT
       COUNT(*)::int AS sessions_completed,
       ROUND(AVG(total_score))::float AS avg_total_score
     FROM interview_sessions
     WHERE user_id IN (
       SELECT id FROM users WHERE batch_id = $1 AND institution_data_sharing_consent = true
     ) AND status = 'completed'`,
    [batchId]
  );
  return row!;
}

export async function getJobApplicationAnalytics(batchId: string): Promise<{
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
}> {
  const rows = await query<{ status: string; count: number }>(
    `SELECT status, COUNT(*)::int AS count
     FROM job_applications
     WHERE user_id IN (
       SELECT id FROM users WHERE batch_id = $1 AND institution_data_sharing_consent = true
     )
     GROUP BY status`,
    [batchId]
  );

  const result = { applied: 0, interview: 0, offer: 0, rejected: 0 };
  for (const r of rows) {
    if (r.status in result) (result as any)[r.status] = r.count;
  }
  return result;
}

export async function getConsentingStudents(batchId: string, limit: number): Promise<Array<{
  id: string;
  name: string;
  email: string;
  onboarding_completed: boolean;
  subscription_tier: string;
}>> {
  return query(
    `SELECT id, name, email, onboarding_completed, subscription_tier
     FROM users
     WHERE batch_id = $1 AND institution_data_sharing_consent = true
     ORDER BY name
     LIMIT $2`,
    [batchId, limit]
  );
}

export async function setDataSharingConsent(userId: string, consent: boolean): Promise<void> {
  await query(
    "UPDATE users SET institution_data_sharing_consent = $1 WHERE id = $2",
    [consent, userId]
  );
}

export async function getUserInstitution(userId: string): Promise<{
  institution_id: string | null;
  batch_id: string | null;
  institution_data_sharing_consent: boolean;
  institution_name: string | null;
  batch_label: string | null;
} | null> {
  return queryOne(
    `SELECT
       u.institution_id, u.batch_id, u.institution_data_sharing_consent,
       i.name AS institution_name, b.label AS batch_label
     FROM users u
     LEFT JOIN institutions i ON i.id = u.institution_id
     LEFT JOIN institution_batches b ON b.id = u.batch_id
     WHERE u.id = $1`,
    [userId]
  );
}
