import { logger } from "../../../lib/logger";

export interface WellfoundJobListing {
  source: string;
  externalId: string;
  title: string;
  company: string;
  companyType: string | null;
  location: string | null;
  description: string;
  applyUrl: string;
  postedAt: string | null;
}

const WELLFOUND_API_BASE = "https://api.angel.co/1";

export async function fetchWellfoundJobs(
  apiKey: string,
  query: string = "software engineer",
  limit: number = 25
): Promise<WellfoundJobListing[]> {
  if (!apiKey) {
    logger.warn("Wellfound API key not configured — skipping Wellfound ingestion");
    return [];
  }

  const url = new URL(`${WELLFOUND_API_BASE}/startups`);
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", String(Math.min(limit, 50)));

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "Wellfound API request failed");
      return [];
    }

    const data = await response.json() as any;

    const startups = data.startups || [];
    const listings: WellfoundJobListing[] = [];

    for (const startup of startups.slice(0, limit)) {
      const jobs = startup.jobs || [];
      for (const job of jobs.slice(0, 3)) {
        listings.push({
          source: "wellfound",
          externalId: String(job.id),
          title: job.title,
          company: startup.name || "Unknown",
          companyType: inferCompanyType(startup.company_type || startup.market),
          location: (job.location || startup.location) ?? null,
          description: job.description || "",
          applyUrl: job.url || "",
          postedAt: job.created_at || null,
        });
      }
    }

    return listings;
  } catch (err) {
    logger.error({ err }, "Wellfound API fetch failed");
    return [];
  }
}

function inferCompanyType(_market: string): string {
  return "startup";
}
