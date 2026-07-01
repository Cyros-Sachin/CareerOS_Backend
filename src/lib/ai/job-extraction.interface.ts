export interface ExtractedSkill {
  skillName: string;
  importance: "required" | "preferred";
}

export interface JobExtractionResult {
  skills: ExtractedSkill[];
}

export interface JobExtractionService {
  extractSkills(jobDescription: string): Promise<JobExtractionResult>;
}

export interface TailoredResumeContent {
  skills: string[];
  projects: Array<{
    name: string;
    description: string;
    techStack: string[];
    githubUrl?: string | null;
    impactStatement?: string | null;
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field: string;
    graduationYear: number;
  }>;
  experience: Array<{
    company: string;
    role: string;
    type: string;
    durationMonths: number;
    description: string;
  }>;
  certifications: string[];
}
