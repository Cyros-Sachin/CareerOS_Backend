import type { ParsedResumeData } from "../../lib/ai/resume-parser.interface";

export type { ParsedResumeData };

export interface DimensionScore {
  raw: number;
  weighted: number;
  weight: number;
}

export interface ScoringResult {
  dimensionScores: Record<string, DimensionScore>;
  atsScore: number;
  suggestions: string[];
}

export function computeAtsScore(
  parsedData: ParsedResumeData,
  targetRoleKeywords: string[]
): ScoringResult {
  const quality = scoreQuality(parsedData);
  const ats = scoreAtsCompatibility(parsedData, targetRoleKeywords);
  const projects = scoreProjects(parsedData);
  const experience = scoreExperience(parsedData);
  const interview = scoreInterviewReadiness(parsedData);
  const market = scoreMarketCompetitiveness(parsedData);

  const dimensions: Record<string, { raw: number; weight: number }> = {
    quality: { raw: quality.score, weight: 0.15 },
    ats: { raw: ats.score, weight: 0.25 },
    projects: { raw: projects.score, weight: 0.25 },
    experience: { raw: experience.score, weight: 0.20 },
    interview: { raw: interview.score, weight: 0.10 },
    market: { raw: market.score, weight: 0.05 },
  };

  const dimensionScores: Record<string, DimensionScore> = {};
  let atsScore = 0;

  for (const [key, val] of Object.entries(dimensions)) {
    dimensionScores[key] = {
      raw: val.raw,
      weight: val.weight,
      weighted: Math.round(val.raw * val.weight * 100) / 100,
    };
    atsScore += val.raw * val.weight;
  }

  atsScore = Math.min(100, Math.max(0, Math.round(atsScore)));

  const suggestions = buildSuggestions(quality, ats, projects, experience, interview, market);

  return { dimensionScores, atsScore, suggestions };
}

function scoreQuality(data: ParsedResumeData): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  if (data.skills.length === 0) {
    score -= 20;
    issues.push("Add a skills section to your resume");
  } else if (data.skills.length < 5) {
    score -= 10;
    issues.push("List more technical skills to strengthen your resume");
  }

  if (data.projects.length === 0) {
    score -= 25;
    issues.push("Add project experience — projects demonstrate practical skills");
  }

  if (data.experience.length === 0) {
    score -= 20;
    issues.push("Include work experience or internship history");
  }

  if (data.education.length === 0) {
    score -= 15;
    issues.push("Add your educational background");
  }

  return { score: Math.max(0, score), issues };
}

function scoreAtsCompatibility(
  data: ParsedResumeData,
  keywords: string[]
): { score: number; issues: string[] } {
  const issues: string[] = [];

  if (keywords.length === 0) {
    return { score: 50, issues: [] };
  }

  const allText = [
    ...data.skills.map((s) => s.toLowerCase()),
    ...data.projects.flatMap((p) => [
      p.name.toLowerCase(),
      p.description.toLowerCase(),
      ...p.techStack.map((t) => t.toLowerCase()),
    ]),
    ...data.experience.flatMap((e) => [
      e.role.toLowerCase(),
      e.description.toLowerCase(),
    ]),
  ].join(" ");

  const matchedKeywords = keywords.filter((kw) => allText.includes(kw.toLowerCase()));
  const ratio = matchedKeywords.length / keywords.length;
  const score = Math.round(ratio * 100);

  if (ratio < 0.3) {
    issues.push("Your resume matches few industry keywords — consider adding more relevant technologies");
  } else if (ratio < 0.6) {
    issues.push("Moderate keyword match. Review job descriptions for your target role and incorporate missing terms");
  }

  return { score, issues };
}

function scoreProjects(data: ParsedResumeData): { score: number; issues: string[] } {
  const issues: string[] = [];

  if (data.projects.length === 0) {
    return { score: 0, issues: ["Add projects to showcase your development skills"] };
  }

  let score = 0;
  const maxScore = 100;
  const maxProjects = 4;

  const projectCount = Math.min(data.projects.length, maxProjects);
  score += (projectCount / maxProjects) * 50;

  let withGithub = 0;
  let withImpact = 0;
  let withTechStack = 0;

  for (const p of data.projects) {
    if (p.githubUrl) withGithub++;
    if (p.impactStatement) withImpact++;
    if (p.techStack && p.techStack.length > 0) withTechStack++;
  }

  score += (withGithub / data.projects.length) * 20;
  score += (withImpact / data.projects.length) * 15;
  score += (withTechStack / data.projects.length) * 15;

  for (const p of data.projects) {
    if (!p.githubUrl) {
      issues.push(`Add a GitHub link to your "${p.name}" project`);
    }
    if (!p.impactStatement) {
      issues.push(`Add an impact statement for "${p.name}" — describe measurable outcomes`);
    }
  }

  if (data.projects.length < 2) {
    issues.push("Add more projects to demonstrate breadth of skills");
  }

  return { score: Math.round(Math.min(score, maxScore)), issues };
}

function scoreExperience(data: ParsedResumeData): { score: number; issues: string[] } {
  const issues: string[] = [];

  if (data.experience.length === 0) {
    return { score: 0, issues: ["Add work experience — even internships strengthen your profile"] };
  }

  let weightedSum = 0;
  const typeWeights: Record<string, number> = {
    internship: 2,
    "full-time": 3,
    "open-source": 1,
  };

  for (const exp of data.experience) {
    const w = typeWeights[exp.type] || 1;
    weightedSum += w;
  }

  const expectedWeight = 4;
  const ratio = Math.min(weightedSum / expectedWeight, 1.5);
  const score = Math.round(Math.min(ratio / 1.5, 1) * 100);

  if (data.experience.filter((e) => e.type === "full-time").length === 0) {
    issues.push("Full-time professional experience strengthens your resume significantly");
  }
  if (data.experience.filter((e) => e.type === "internship").length === 0) {
    issues.push("Internship experience is highly valued — consider adding any you have");
  }

  return { score, issues };
}

function scoreInterviewReadiness(data: ParsedResumeData): { score: number; issues: string[] } {
  const issues: string[] = [];

  const interviewKeywords = [
    "dsa", "data structures", "algorithm", "leetcode", "competitive programming",
    "system design", "hackathon", "codefest", "coding competition",
    "problem solving", "optimization", "complexity",
  ];

  const allText = [
    ...data.skills.map((s) => s.toLowerCase()),
    ...data.projects.flatMap((p) => [
      p.description.toLowerCase(),
      ...p.techStack.map((t) => t.toLowerCase()),
      p.impactStatement?.toLowerCase() || "",
    ]),
    ...data.experience.map((e) => e.description.toLowerCase()),
  ].join(" ");

  const matches = interviewKeywords.filter((kw) => allText.includes(kw));
  const score = Math.round(Math.min((matches.length / interviewKeywords.length) * 100, 100));

  if (matches.length < 2) {
    issues.push("Add DSA/system design keywords or hackathon participation to demonstrate interview readiness");
  }
  if (matches.length < 4) {
    issues.push("Mention competitive programming or coding competitions if applicable");
  }

  return { score, issues };
}

function scoreMarketCompetitiveness(_data: ParsedResumeData): { score: number; issues: string[] } {
  const issues: string[] = [];
  const score = 65;

  issues.push("Market competitiveness is calculated relative to peers — upload more resumes for accurate benchmarking");

  return { score, issues };
}

function buildSuggestions(
  quality: { score: number; issues: string[] },
  ats: { score: number; issues: string[] },
  projects: { score: number; issues: string[] },
  experience: { score: number; issues: string[] },
  interview: { score: number; issues: string[] },
  market: { score: number; issues: string[] }
): string[] {
  const all: string[] = [
    ...quality.issues,
    ...ats.issues,
    ...projects.issues,
    ...experience.issues,
    ...interview.issues,
    ...market.issues,
  ];

  if (all.length < 5) {
    const fillers = [
      "Ensure your contact information is up to date",
      "Tailor your resume for each job application",
      "Use action verbs (built, designed, implemented) in experience descriptions",
      "Quantify achievements with metrics where possible",
      "Keep your resume format clean and ATS-friendly",
      "Update your LinkedIn profile to match your resume",
    ];
    while (all.length < 5) {
      all.push(fillers[all.length % fillers.length]);
    }
  }

  return all.slice(0, 10);
}
