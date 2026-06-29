import { query, queryOne } from "../../db/pool";

export interface RoleRequirementRow {
  id: string;
  role_name: string;
  skill_id: string;
  importance_weight: number;
  min_proficiency: string;
  est_learning_hours: number | null;
  skill_name: string;
  skill_category: string;
  skill_aliases: string[];
}

export interface SkillRow {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  embedding: number[] | null;
}

export async function getRoleRequirements(roleName: string): Promise<RoleRequirementRow[]> {
  return query<RoleRequirementRow>(
    `SELECT rr.id, rr.role_name, rr.skill_id, rr.importance_weight,
            rr.min_proficiency, rr.est_learning_hours,
            s.name AS skill_name, s.category AS skill_category, s.aliases AS skill_aliases
     FROM role_requirements rr
     JOIN skills s ON s.id = rr.skill_id
     WHERE LOWER(rr.role_name) = LOWER($1)
     ORDER BY rr.importance_weight DESC`,
    [roleName]
  );
}

export async function findSkillByNameOrAlias(name: string): Promise<SkillRow | null> {
  return queryOne<SkillRow>(
    `SELECT id, name, category, aliases, embedding
     FROM skills
     WHERE LOWER(name) = LOWER($1)
        OR EXISTS (SELECT 1 FROM unnest(aliases) AS a WHERE LOWER(a) = LOWER($1))
     LIMIT 1`,
    [name]
  );
}

export async function findSimilarSkills(
  embedding: number[],
  threshold: number,
  limit = 5
): Promise<SkillRow[]> {
  return query<SkillRow>(
    `SELECT id, name, category, aliases, embedding
     FROM skills
     WHERE embedding IS NOT NULL
       AND embedding <=> $1::vector < $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [JSON.stringify(embedding), 1 - threshold, limit]
  );
}
