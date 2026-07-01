import { query } from "../../db/pool";

interface MatchResult {
  id: string;
  source: string;
  external_id: string;
  title: string;
  company: string;
  company_type: string | null;
  location: string | null;
  description: string;
  apply_url: string;
  posted_at: string | null;
  matchPercent: number;
  missingSkills: Array<{ skillName: string; importance: string }>;
  userSkills: string[];
}

export async function computeMatches(params: {
  profileEmbedding: number[];
  location?: string;
  companyType?: string;
  limit: number;
  userSkills: string[];
}): Promise<MatchResult[]> {
  const conditions: string[] = ["j.is_active = true", "j.jd_embedding IS NOT NULL"];
  const values: any[] = [JSON.stringify(params.profileEmbedding)];
  let paramIndex = 2;

  if (params.location) {
    conditions.push(`LOWER(j.location) LIKE LOWER($${paramIndex})`);
    values.push(`%${params.location}%`);
    paramIndex++;
  }

  if (params.companyType) {
    conditions.push(`j.company_type = $${paramIndex}::company_type`);
    values.push(params.companyType);
    paramIndex++;
  }

  values.push(params.limit);

  const rows = await query<any>(
    `SELECT j.id, j.source, j.external_id, j.title, j.company, j.company_type,
            j.location, j.description, j.apply_url, j.posted_at,
            (1 - (j.jd_embedding <=> $1::vector)) as raw_similarity
     FROM jobs j
     WHERE ${conditions.join(" AND ")}
     ORDER BY j.jd_embedding <=> $1::vector ASC
     LIMIT $${paramIndex}`,
    values
  );

  const results: MatchResult[] = [];

  for (const row of rows) {
    const matchPercent = normalizeCosineSimilarity(row.raw_similarity);

    const { missingSkills, jobSkills } = await computeMissingSkills(row.id, params.userSkills);

    results.push({
      id: row.id,
      source: row.source,
      external_id: row.external_id,
      title: row.title,
      company: row.company,
      company_type: row.company_type,
      location: row.location,
      description: row.description,
      apply_url: row.apply_url,
      posted_at: row.posted_at,
      matchPercent,
      missingSkills,
      userSkills: params.userSkills,
    });
  }

  return results;
}

export async function computeManualMatch(params: {
  jobSkills: Array<{ skillName: string; importance: string }>;
  userSkills: string[];
}): Promise<{ matchPercent: number; missingSkills: Array<{ skillName: string; importance: string }>; matchedSkills: string[] }> {
  const userSkillLower = params.userSkills.map((s) => s.toLowerCase());

  const missingSkills: Array<{ skillName: string; importance: string }> = [];
  const matchedSkills: string[] = [];

  for (const js of params.jobSkills) {
    if (userSkillLower.includes(js.skillName.toLowerCase())) {
      matchedSkills.push(js.skillName);
    } else {
      missingSkills.push(js);
    }
  }

  const totalSkills = params.jobSkills.length;
  const matchPercent = totalSkills > 0
    ? Math.round((matchedSkills.length / totalSkills) * 100)
    : 0;

  return { matchPercent, missingSkills, matchedSkills };
}

export async function computeMissingSkills(
  jobId: string,
  userSkills: string[]
): Promise<{
  missingSkills: Array<{ skillName: string; importance: string }>;
  jobSkills: Array<{ skillName: string; importance: string }>;
}> {
  const rows = await query<{ skill_name: string; importance: string }>(
    `SELECT s.name as skill_name, js.importance
     FROM job_skills js JOIN skills s ON s.id = js.skill_id
     WHERE js.job_id = $1`,
    [jobId]
  );

  const userSkillLower = userSkills.map((s) => s.toLowerCase());
  const missingSkills: Array<{ skillName: string; importance: string }> = [];
  const jobSkills: Array<{ skillName: string; importance: string }> = [];

  for (const row of rows) {
    jobSkills.push({ skillName: row.skill_name, importance: row.importance });
    if (!userSkillLower.includes(row.skill_name.toLowerCase())) {
      missingSkills.push({ skillName: row.skill_name, importance: row.importance });
    }
  }

  return { missingSkills, jobSkills };
}

function normalizeCosineSimilarity(rawSimilarity: number): number {
  if (rawSimilarity == null) return 0;
  const clamped = Math.max(-1, Math.min(1, rawSimilarity));
  return Math.round(((clamped + 1) / 2) * 100);
}
