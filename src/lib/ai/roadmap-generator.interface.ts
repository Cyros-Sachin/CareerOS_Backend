export interface RoadmapResource {
  type: "doc" | "video" | "course";
  url: string;
  title: string;
  isAffiliate: boolean;
}

export interface RoadmapItem {
  monthNumber: number;
  topic: string;
  resources: RoadmapResource[];
  projectAssignment: string | null;
  estimatedHours: number | null;
}

export interface RoadmapPlan {
  items: RoadmapItem[];
}

export interface MissingSkill {
  skillName: string;
  importanceWeight: number;
  estLearningHours: number | null;
}

export interface RoadmapGenerationParams {
  targetRole: string;
  currentSkillLevel: string;
  hoursPerWeek: number;
  maxMonths: number;
  currentSkills: string[];
  missingSkills: MissingSkill[];
}

export interface RoadmapGeneratorService {
  generateRoadmap(params: RoadmapGenerationParams): Promise<RoadmapPlan>;
}
