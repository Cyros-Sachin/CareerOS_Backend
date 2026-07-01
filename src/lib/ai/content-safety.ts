const BLOCKED_PATTERNS: RegExp[] = [
  /how\s+to\s+(hack|crack|cheat|bypass)/i,
  /generate\s+(malware|virus|exploit)/i,
  /write\s+(ransomware|keylogger|trojan)/i,
  /illegal\s+(drug|download|crack)/i,
  /credit\s+card\s+(generator|bins?|dump)/i,
  /social\s+security\s+(number|generator)/i,
  /suicide\s+(methods?|how|guide)/i,
  /self[- ]harm/i,
  /nudity|porn|nsfw\s+(content|image)/i,
  /gore|violence\s+against/i,
];

const REDIRECT_RESPONSE =
  "I'm here to help with your career development — resume reviews, interview prep, skill-building advice, and job search strategies. Let me know how I can assist with your career goals!";

export interface SafetyCheckResult {
  flagged: boolean;
  response: string | null;
}

export function checkContentSafety(message: string): SafetyCheckResult {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(message)) {
      return { flagged: true, response: REDIRECT_RESPONSE };
    }
  }
  return { flagged: false, response: null };
}

export { BLOCKED_PATTERNS, REDIRECT_RESPONSE };
