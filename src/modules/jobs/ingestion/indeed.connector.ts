import { logger } from "../../../lib/logger";

export interface IndeedJobListing {
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

interface IndeedApiResponse {
  results: Array<{
    jobkey: string;
    jobtitle: string;
    company: string;
    city: string;
    state: string;
    country: string;
    formattedLocation: string;
    snippet: string;
    url: string;
    date: string;
    source: string;
    onmousedown: string;
    expires: number;
    indicatormap: Record<string, string>;
  }>;
  totalResults: number;
  pageNumber: number;
  version: string;
  attribution: {
    publisherAttribution: string;
  };
}

const INDEED_BASE_URL = "https://api.indeed.com/ads/apisearch";

export async function fetchIndeedJobs(
  publisherId: string,
  query: string = "software engineer",
  location: string = "",
  limit: number = 25
): Promise<IndeedJobListing[]> {
  if (!publisherId) {
    logger.warn("Indeed Publisher ID not configured — skipping Indeed ingestion");
    return [];
  }

  const url = new URL(INDEED_BASE_URL);
  url.searchParams.set("publisher", publisherId);
  url.searchParams.set("q", query);
  url.searchParams.set("l", location);
  url.searchParams.set("format", "json");
  url.searchParams.set("v", "2");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("filter", "1");

  try {
    const response = await fetch(url.toString(), {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, "Indeed API request failed");
      return [];
    }

    const data = await response.json() as IndeedApiResponse;

    return data.results.map((job) => {
      const fullDesc = job.snippet || "";
      return {
        source: "indeed",
        externalId: job.jobkey,
        title: job.jobtitle,
        company: job.company,
        companyType: inferCompanyType(job.company),
        location: job.formattedLocation || null,
        description: fullDesc,
        applyUrl: job.url,
        postedAt: job.date || null,
      };
    });
  } catch (err) {
    logger.error({ err }, "Indeed API fetch failed");
    return [];
  }
}

function inferCompanyType(_company: string): string | null {
  return null;
}
