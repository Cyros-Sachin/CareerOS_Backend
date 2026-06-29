import { describe, it, expect } from "vitest";
import { computeAtsScore, type ParsedResumeData } from "../src/modules/resume/scoring.service";

describe("Scoring Service — Unit Tests", () => {
  const sampleParsedData: ParsedResumeData = {
    skills: ["JavaScript", "TypeScript", "React", "Node.js", "Python", "Docker"],
    projects: [
      {
        name: "E-commerce Platform",
        description: "Built a full-stack e-commerce platform with payment integration",
        techStack: ["React", "Node.js", "PostgreSQL", "Stripe"],
        githubUrl: "https://github.com/user/ecommerce",
        impactStatement: "Handled 10k+ daily transactions",
      },
    ],
    education: [
      {
        institution: "IIT Bombay",
        degree: "B.Tech",
        field: "Computer Science",
        graduationYear: 2025,
      },
    ],
    experience: [
      {
        company: "Google",
        role: "SDE Intern",
        type: "internship" as const,
        durationMonths: 3,
        description: "Worked on Google Cloud Platform team",
      },
    ],
    certifications: ["AWS Certified Developer"],
  };

  it("should compute ATS score within 0-100 range", () => {
    const result = computeAtsScore(sampleParsedData, ["JavaScript", "React", "Node.js", "Python", "Docker"]);
    expect(result.atsScore).toBeGreaterThanOrEqual(0);
    expect(result.atsScore).toBeLessThanOrEqual(100);
  });

  it("should return all 6 dimension scores", () => {
    const result = computeAtsScore(sampleParsedData, ["JavaScript"]);
    const dimensions = ["quality", "ats", "projects", "experience", "interview", "market"];
    for (const dim of dimensions) {
      expect(result.dimensionScores[dim]).toBeDefined();
      expect(result.dimensionScores[dim].raw).toBeGreaterThanOrEqual(0);
      expect(result.dimensionScores[dim].raw).toBeLessThanOrEqual(100);
      expect(result.dimensionScores[dim].weight).toBeGreaterThan(0);
    }
  });

  it("should generate 5-10 suggestions", () => {
    const result = computeAtsScore(sampleParsedData, []);
    expect(result.suggestions.length).toBeGreaterThanOrEqual(5);
    expect(result.suggestions.length).toBeLessThanOrEqual(10);
  });

  it("should score empty resume low", () => {
    const empty: ParsedResumeData = {
      skills: [],
      projects: [],
      education: [],
      experience: [],
      certifications: [],
    };
    const result = computeAtsScore(empty, []);
    expect(result.atsScore).toBeLessThan(50);
  });

  it("should weight dimensions correctly", () => {
    const result = computeAtsScore(sampleParsedData, ["JavaScript"]);

    const expectedWeightedSum = Object.values(result.dimensionScores).reduce(
      (sum, d) => sum + d.raw * d.weight,
      0
    );

    expect(result.atsScore).toBe(Math.round(expectedWeightedSum));
  });

  it("should return concrete suggestions for missing github urls", () => {
    const noGithub: ParsedResumeData = {
      skills: ["JavaScript"],
      projects: [
        {
          name: "Test Project",
          description: "A test project",
          techStack: ["JS"],
          githubUrl: null,
          impactStatement: null,
        },
      ],
      education: [],
      experience: [],
      certifications: [],
    };
    const result = computeAtsScore(noGithub, []);
    const hasGithubSuggestion = result.suggestions.some((s) => s.includes("GitHub"));
    expect(hasGithubSuggestion).toBe(true);
  });

  it("should penalize missing projects", () => {
    const noProjects: ParsedResumeData = {
      skills: ["JavaScript"],
      projects: [],
      education: [],
      experience: [],
      certifications: [],
    };
    const result = computeAtsScore(noProjects, []);
    expect(result.dimensionScores.projects.raw).toBe(0);
  });

  it("should penalize missing experience", () => {
    const noExperience: ParsedResumeData = {
      skills: ["JavaScript"],
      projects: [],
      education: [],
      experience: [],
      certifications: [],
    };
    const result = computeAtsScore(noExperience, []);
    expect(result.dimensionScores.experience.raw).toBe(0);
  });

  it("should give higher score for more experience", () => {
    const singleExp: ParsedResumeData = {
      skills: ["JavaScript"],
      projects: [],
      education: [],
      experience: [
        { company: "C1", role: "R1", type: "internship", durationMonths: 3, description: "Work" },
      ],
      certifications: [],
    };

    const multiExp: ParsedResumeData = {
      skills: ["JavaScript"],
      projects: [],
      education: [],
      experience: [
        { company: "C1", role: "R1", type: "internship", durationMonths: 3, description: "Work" },
        { company: "C2", role: "R2", type: "full-time", durationMonths: 12, description: "Work" },
      ],
      certifications: [],
    };

    const singleResult = computeAtsScore(singleExp, []);
    const multiResult = computeAtsScore(multiExp, []);

    expect(multiResult.dimensionScores.experience.raw).toBeGreaterThan(
      singleResult.dimensionScores.experience.raw
    );
  });
});
