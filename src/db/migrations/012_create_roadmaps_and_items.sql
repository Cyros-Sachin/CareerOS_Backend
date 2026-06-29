CREATE TABLE roadmaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_role VARCHAR(255) NOT NULL,
  hours_per_week INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  generated_from_skill_level proficiency_level NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_roadmaps_active_user_role ON roadmaps(user_id, target_role) WHERE status = 'active';
CREATE INDEX idx_roadmaps_user_id ON roadmaps(user_id);

CREATE TABLE roadmap_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id UUID NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
  month_number INTEGER NOT NULL,
  topic VARCHAR(255) NOT NULL,
  skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  resources JSONB NOT NULL DEFAULT '[]',
  project_assignment TEXT,
  estimated_hours INTEGER,
  is_complete BOOLEAN DEFAULT false,
  completed_at TIMESTAMP
);

CREATE INDEX idx_roadmap_items_roadmap_id ON roadmap_items(roadmap_id, month_number);
