import { env } from "../../config/env";
import { HttpError } from "../../middleware/errorHandler";

export class GithubAuditService {
  async audit(githubUrl: string): Promise<Record<string, unknown>> {
    const username = githubUrl
      .replace(/^https?:\/\/(www\.)?github\.com\//, "")
      .replace(/\/$/, "")
      .split("/")[0];

    if (!/^[a-zA-Z0-9_-]{1,39}$/.test(username)) {
      throw new HttpError(400, "INVALID_GITHUB_USERNAME", "Could not extract a valid GitHub username from the URL");
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "CareerOS-Mentor/1.0",
    };
    if (env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    }

    let profileRes: Response;
    let reposRes: Response;

    try {
      [profileRes, reposRes] = await Promise.all([
        fetch(`https://api.github.com/users/${username}`, { headers }),
        fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=10`, { headers }),
      ]);
    } catch {
      throw new HttpError(502, "GITHUB_API_ERROR", "Failed to fetch GitHub data");
    }

    if (profileRes.status === 404) {
      throw new HttpError(404, "GITHUB_USER_NOT_FOUND", "GitHub user not found");
    }
    if (!profileRes.ok || !reposRes.ok) {
      throw new HttpError(502, "GITHUB_API_ERROR", `GitHub API responded with ${profileRes.status}`);
    }

    const profile = await profileRes.json() as Record<string, unknown>;
    const repos = await reposRes.json() as Array<Record<string, unknown>>;

    const languages = new Set<string>();
    let totalStars = 0;
    let totalForks = 0;
    const topRepos: string[] = [];

    for (const repo of repos) {
      if (repo.language) languages.add(repo.language as string);
      if (repo.description) {
        topRepos.push(repo.name as string);
      }
      totalStars += (repo.stargazers_count as number) || 0;
      totalForks += (repo.forks_count as number) || 0;
    }

    return {
      username,
      publicRepos: profile.public_repos ?? 0,
      followers: profile.followers ?? 0,
      following: profile.following ?? 0,
      bio: profile.bio ?? null,
      company: profile.company ?? null,
      location: profile.location ?? null,
      blog: profile.blog ?? null,
      totalStars,
      totalForks,
      languages: Array.from(languages),
      topRepos: topRepos.slice(0, 5),
      profileUrl: profile.html_url ?? githubUrl,
      auditGeneratedAt: new Date().toISOString(),
    };
  }
}
