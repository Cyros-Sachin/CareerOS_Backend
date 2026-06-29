export interface ParsedResumeData {
  skills: string[];
  projects: Array<{
    name: string;
    description: string;
    techStack: string[];
    githubUrl: string | null;
    impactStatement: string | null;
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field: string;
    graduationYear: number | null;
  }>;
  experience: Array<{
    company: string;
    role: string;
    type: "internship" | "full-time" | "open-source";
    durationMonths: number | null;
    description: string;
  }>;
  certifications: string[];
}

export interface ResumeParserService {
  parseResume(rawText: string): Promise<ParsedResumeData>;
}
