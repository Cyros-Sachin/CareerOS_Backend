import { query, queryOne } from "../../db/pool";

export interface JobRow {
  id: string;
  source: string;
  external_id: string;
  title: string;
  company: string;
  company_type: string | null;
  location: string | null;
  description: string;
  jd_embedding: number[] | null;
  apply_url: string;
  posted_at: string | null;
  scraped_at: string;
  is_active: boolean;
  created_at: string;
}

export interface JobSkillRow {
  id: string;
  job_id: string;
  skill_id: string;
  importance: string;
}

export interface JobApplicationRow {
  id: string;
  user_id: string;
  job_id: string;
  status: string;
  applied_at: string;
  updated_at: string;
  notes: string | null;
}

export interface TailoredResumeRow {
  id: string;
  user_id: string;
  source_resume_id: string;
  job_id: string | null;
  tailored_content: Record<string, unknown>;
  created_at: string;
}

// ─── Jobs ──────────────────────────────────────────────

export async function findActiveJobsWithFilters(params: {
  location?: string;
  companyType?: string;
  limit: number;
}): Promise<JobRow[]> {
  const conditions: string[] = ["is_active = true"];
  const values: any[] = [];
  let paramIndex = 1;

  if (params.location) {
    conditions.push(`LOWER(location) LIKE LOWER($${paramIndex})`);
    values.push(`%${params.location}%`);
    paramIndex++;
  }

  if (params.companyType) {
    conditions.push(`company_type = $${paramIndex}::company_type`);
    values.push(params.companyType);
    paramIndex++;
  }

  return query<JobRow>(
    `SELECT * FROM jobs WHERE ${conditions.join(" AND ")} ORDER BY scraped_at DESC LIMIT $${paramIndex}`,
    [...values, params.limit]
  );
}

export async function findJobById(id: string): Promise<JobRow | null> {
  return queryOne<JobRow>("SELECT * FROM jobs WHERE id = $1", [id]);
}

export async function upsertJob(data: {
  source: string;
  externalId: string;
  title: string;
  company: string;
  companyType: string | null;
  location: string | null;
  description: string;
  applyUrl: string;
  postedAt: string | null;
}): Promise<JobRow> {
  return (await queryOne<JobRow>(
    `INSERT INTO jobs (source, external_id, title, company, company_type, location, description, apply_url, posted_at)
     VALUES ($1::job_source, $2, $3, $4, $5::company_type, $6, $7, $8, $9)
     ON CONFLICT (source, external_id)
     DO UPDATE SET title = EXCLUDED.title, company = EXCLUDED.company,
                   company_type = EXCLUDED.company_type, location = EXCLUDED.location,
                   description = EXCLUDED.description, apply_url = EXCLUDED.apply_url,
                   posted_at = EXCLUDED.posted_at, scraped_at = NOW(), is_active = true
     RETURNING *`,
    [data.source, data.externalId, data.title, data.company, data.companyType, data.location, data.description, data.applyUrl, data.postedAt]
  ))!;
}

export async function updateJobEmbedding(id: string, embedding: number[]): Promise<void> {
  await query(
    "UPDATE jobs SET jd_embedding = $1::vector WHERE id = $2",
    [JSON.stringify(embedding), id]
  );
}

export async function deactivateStaleJobs(beforeTimestamp: string): Promise<void> {
  await query(
    "UPDATE jobs SET is_active = false WHERE is_active = true AND scraped_at < $1",
    [beforeTimestamp]
  );
}

// ─── Job Skills ────────────────────────────────────────

export async function upsertJobSkill(data: {
  jobId: string;
  skillId: string;
  importance: string;
}): Promise<void> {
  await query(
    `INSERT INTO job_skills (job_id, skill_id, importance)
     VALUES ($1, $2, $3::skill_importance)
     ON CONFLICT DO NOTHING`,
    [data.jobId, data.skillId, data.importance]
  );
}

export async function getJobSkills(jobId: string): Promise<JobSkillRow[]> {
  return query<JobSkillRow>(
    `SELECT js.*, s.name as skill_name FROM job_skills js
     JOIN skills s ON s.id = js.skill_id
     WHERE js.job_id = $1`,
    [jobId]
  );
}

export async function getJobSkillsWithNames(jobId: string): Promise<Array<{
  skillId: string;
  skillName: string;
  importance: string;
}>> {
  const rows = await query<{ skill_id: string; skill_name: string; importance: string }>(
    `SELECT js.skill_id, s.name as skill_name, js.importance
     FROM job_skills js JOIN skills s ON s.id = js.skill_id
     WHERE js.job_id = $1`,
    [jobId]
  );
  return rows.map((r) => ({ skillId: r.skill_id, skillName: r.skill_name, importance: r.importance }));
}

// ─── Job Applications ──────────────────────────────────

export async function createApplication(data: {
  userId: string;
  jobId: string;
  notes?: string;
}): Promise<JobApplicationRow> {
  return (await queryOne<JobApplicationRow>(
    `INSERT INTO job_applications (user_id, job_id, notes)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, job_id) DO UPDATE SET status = 'applied', updated_at = NOW(), notes = EXCLUDED.notes
     RETURNING *`,
    [data.userId, data.jobId, data.notes || null]
  ))!;
}

export async function findApplicationById(id: string): Promise<JobApplicationRow | null> {
  return queryOne<JobApplicationRow>("SELECT * FROM job_applications WHERE id = $1", [id]);
}

export async function updateApplication(id: string, data: {
  status?: string;
  notes?: string;
}): Promise<JobApplicationRow | null> {
  const sets: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (data.status) {
    sets.push(`status = $${paramIndex}::application_status`);
    values.push(data.status);
    paramIndex++;
  }
  if (data.notes !== undefined) {
    sets.push(`notes = $${paramIndex}`);
    values.push(data.notes);
    paramIndex++;
  }

  if (sets.length === 0) return null;

  values.push(id);
  return queryOne<JobApplicationRow>(
    `UPDATE job_applications SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`,
    values
  );
}

export async function getUserApplications(userId: string, status?: string): Promise<JobApplicationRow[]> {
  const conditions: string[] = ["ja.user_id = $1"];
  const values: any[] = [userId];
  let paramIndex = 2;

  if (status) {
    conditions.push(`ja.status = $${paramIndex}::application_status`);
    values.push(status);
    paramIndex++;
  }

  return query<JobApplicationRow>(
    `SELECT ja.*, j.title, j.company, j.location, j.apply_url
     FROM job_applications ja
     JOIN jobs j ON j.id = ja.job_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY ja.updated_at DESC`,
    values
  );
}

// ─── Tailored Resumes ──────────────────────────────────

export async function createTailoredResume(data: {
  userId: string;
  sourceResumeId: string;
  jobId: string | null;
  tailoredContent: Record<string, unknown>;
}): Promise<TailoredResumeRow> {
  return (await queryOne<TailoredResumeRow>(
    `INSERT INTO tailored_resumes (user_id, source_resume_id, job_id, tailored_content)
     VALUES ($1, $2, $3, $4::jsonb)
     RETURNING *`,
    [data.userId, data.sourceResumeId, data.jobId, JSON.stringify(data.tailoredContent)]
  ))!;
}

export async function findTailoredResumeById(id: string): Promise<TailoredResumeRow | null> {
  return queryOne<TailoredResumeRow>("SELECT * FROM tailored_resumes WHERE id = $1", [id]);
}

// ─── Manual Job (not persisted to shared jobs table) ───
// Used only for scoring a pasted JD without storing it

export async function findSkillByName(name: string): Promise<{ id: string; name: string } | null> {
  return queryOne<{ id: string; name: string }>(
    "SELECT id, name FROM skills WHERE LOWER(name) = LOWER($1)",
    [name]
  );
}

export async function findSkillsBySimilarName(name: string): Promise<Array<{ id: string; name: string }>> {
  return query<{ id: string; name: string }>(
    "SELECT id, name FROM skills WHERE name % $1 ORDER BY similarity(name, $1) DESC LIMIT 3",
    [name]
  );
}

export async function getUserSkills(userId: string): Promise<string[]> {
  const rows = await query<{ skill_name: string }>(
    `SELECT DISTINCT jsonb_array_elements_text(r.parsed_data->'skills') as skill_name
     FROM resumes r WHERE r.user_id = $1 AND r.is_active = true AND r.parsed_data IS NOT NULL`,
    [userId]
  );
  return rows.map((r) => r.skill_name);
}
