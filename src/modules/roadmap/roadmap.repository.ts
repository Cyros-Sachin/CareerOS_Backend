import { query, queryOne } from "../../db/pool";

export interface RoadmapRow {
  id: string;
  user_id: string;
  target_role: string;
  hours_per_week: number;
  status: string;
  generated_from_skill_level: string;
  created_at: string;
}

export interface RoadmapItemRow {
  id: string;
  roadmap_id: string;
  month_number: number;
  topic: string;
  skill_id: string | null;
  resources: any;
  project_assignment: string | null;
  estimated_hours: number | null;
  is_complete: boolean;
  completed_at: string | null;
}

export async function findActiveRoadmap(userId: string, targetRole?: string): Promise<RoadmapRow | null> {
  const conditions = ["user_id = $1", "status = 'active'"];
  const params: any[] = [userId];

  if (targetRole) {
    conditions.push(`LOWER(target_role) = LOWER($2)`);
    params.push(targetRole);
  }

  return queryOne<RoadmapRow>(
    `SELECT * FROM roadmaps WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT 1`,
    params
  );
}

export async function findById(id: string): Promise<RoadmapRow | null> {
  return queryOne<RoadmapRow>("SELECT * FROM roadmaps WHERE id = $1", [id]);
}

export async function getRoadmapItems(roadmapId: string): Promise<RoadmapItemRow[]> {
  return query<RoadmapItemRow>(
    "SELECT * FROM roadmap_items WHERE roadmap_id = $1 ORDER BY month_number ASC",
    [roadmapId]
  );
}

export async function createRoadmap(data: {
  userId: string;
  targetRole: string;
  hoursPerWeek: number;
  skillLevel: string;
}): Promise<RoadmapRow> {
  return (await queryOne<RoadmapRow>(
    `INSERT INTO roadmaps (user_id, target_role, hours_per_week, generated_from_skill_level)
     VALUES ($1, $2, $3, $4::proficiency_level)
     RETURNING *`,
    [data.userId, data.targetRole, data.hoursPerWeek, data.skillLevel]
  ))!;
}

export async function markSuperseded(userId: string, targetRole: string): Promise<void> {
  await query(
    `UPDATE roadmaps SET status = 'superseded'
     WHERE user_id = $1 AND LOWER(target_role) = LOWER($2) AND status = 'active'`,
    [userId, targetRole]
  );
}

export async function insertRoadmapItems(items: Array<{
  roadmapId: string;
  monthNumber: number;
  topic: string;
  skillId: string | null;
  resources: any;
  projectAssignment: string | null;
  estimatedHours: number | null;
}>): Promise<void> {
  if (items.length === 0) return;

  const values = items.map((_, i) => {
    const base = i * 8;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, $${base + 6}, $${base + 7})`;
  }).join(", ");

  const params = items.flatMap((item) => [
    item.roadmapId,
    item.monthNumber,
    item.topic,
    item.skillId,
    JSON.stringify(item.resources),
    item.projectAssignment,
    item.estimatedHours,
  ]);

  await query(
    `INSERT INTO roadmap_items (roadmap_id, month_number, topic, skill_id, resources, project_assignment, estimated_hours)
     VALUES ${values}`,
    params
  );
}

export async function updateItemCompletion(itemId: string, isComplete: boolean): Promise<RoadmapItemRow | null> {
  if (isComplete) {
    return queryOne<RoadmapItemRow>(
      `UPDATE roadmap_items SET is_complete = TRUE, completed_at = NOW()
       WHERE id = $1 RETURNING *`,
      [itemId]
    );
  }
  return queryOne<RoadmapItemRow>(
    `UPDATE roadmap_items SET is_complete = FALSE, completed_at = NULL
     WHERE id = $1 RETURNING *`,
    [itemId]
  );
}

export async function findItemById(itemId: string): Promise<RoadmapItemRow | null> {
  return queryOne<RoadmapItemRow>("SELECT * FROM roadmap_items WHERE id = $1", [itemId]);
}
