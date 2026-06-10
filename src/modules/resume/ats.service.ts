
import { TECH_SKILLS }
from "./constants/skills";

export interface ATSResult {
  score: number;

  matchedSkills: string[];

  feedback: string[];
}
export function calculateATS(
  text: string
): ATSResult {

  const lower =
    text.toLowerCase();

  const matchedSkills =
    TECH_SKILLS.filter(
      (skill) =>
        lower.includes(
          skill.toLowerCase()
        )
    );

  const feedback: string[] =
    [];

  let score = 0;

  score += Math.min(
    matchedSkills.length * 4,
    40
  );

  if (
    lower.includes("project")
  ) {
    score += 20;
  } else {
    feedback.push(
      "Add project experience."
    );
  }

  if (
    lower.includes("intern")
  ) {
    score += 20;
  } else {
    feedback.push(
      "Add internship experience."
    );
  }

  if (
    lower.includes("b.tech") ||
    lower.includes("bachelor")
  ) {
    score += 20;
  } else {
    feedback.push(
      "Education section missing."
    );
  }

  return {
    score: Math.min(
      score,
      100
    ),

    matchedSkills,

    feedback,
  };
}