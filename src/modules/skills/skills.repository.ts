import { query, queryOne } from "../../db/pool";

export interface SkillRow {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  embedding: number[] | null;
  description: string | null;
  created_at: string;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export async function searchSkills(category?: string, search?: string, limit = 50): Promise<SkillRow[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (category) {
    conditions.push(`category = $${idx++}`);
    params.push(category);
  }

  if (search) {
    conditions.push(`(name ILIKE $${idx} OR EXISTS(SELECT 1 FROM unnest(aliases) AS a WHERE a ILIKE $${idx}))`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return query<SkillRow>(
    `SELECT id, name, category, aliases, embedding, description, created_at
     FROM skills ${where}
     ORDER BY name ASC
     LIMIT $${idx}`,
    [...params, limit]
  );
}

export async function getCategoryCounts(): Promise<CategoryCount[]> {
  return query<CategoryCount>(
    `SELECT category, COUNT(*)::int AS count
     FROM skills
     GROUP BY category
     ORDER BY category ASC`
  );
}

export async function findByName(name: string): Promise<SkillRow | null> {
  return queryOne<SkillRow>(
    `SELECT id, name, category, aliases, embedding, description, created_at
     FROM skills WHERE LOWER(name) = LOWER($1)`,
    [name]
  );
}

export async function findByNames(names: string[]): Promise<SkillRow[]> {
  if (names.length === 0) return [];
  const placeholders = names.map((_, i) => `LOWER($${i + 1})`).join(", ");
  return query<SkillRow>(
    `SELECT DISTINCT ON (s.id) s.id, s.name, s.category, s.aliases, s.embedding, s.description, s.created_at
     FROM skills s
     WHERE LOWER(s.name) IN (${placeholders})
        OR EXISTS (SELECT 1 FROM unnest(s.aliases) AS a WHERE LOWER(a) IN (${placeholders}))`,
    names.map((n) => n.toLowerCase())
  );
}

export async function findSimilarByEmbedding(
  embedding: number[],
  threshold = 0.85,
  limit = 5
): Promise<SkillRow[]> {
  return query<SkillRow>(
    `SELECT id, name, category, aliases, embedding, description, created_at
     FROM skills
     WHERE embedding IS NOT NULL
       AND embedding <=> $1::vector < $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(embedding), 1 - threshold, limit]
  );
}

export async function findByNameOrAlias(name: string): Promise<SkillRow | null> {
  return queryOne<SkillRow>(
    `SELECT id, name, category, aliases, embedding, description, created_at
     FROM skills
     WHERE LOWER(name) = LOWER($1)
        OR EXISTS (SELECT 1 FROM unnest(aliases) AS a WHERE LOWER(a) = LOWER($1))
     LIMIT 1`,
    [name]
  );
}

export async function getAllSkillNames(): Promise<string[]> {
  const rows = await query<{ name: string }>("SELECT name FROM skills ORDER BY name");
  return rows.map((r) => r.name);
}

export async function getAllKeywords(): Promise<string[]> {
  const rows = await query<{ name: string }>("SELECT DISTINCT name FROM skills ORDER BY name");
  return rows.map((r) => r.name);
}
