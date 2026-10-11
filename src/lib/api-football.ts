import axios from "axios";
import { addDays, format } from "date-fns";

const API_KEY = process.env.API_FOOTBALL_KEY!;
const BASE_URL = "https://v3.football.api-sports.io";

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    "x-apisports-key": API_KEY,
  },
});

export interface Fixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
  };
  league: {
    id: number;
    name: string;
    country: string;
    logo: string;
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

export interface ApiStatistic {
  type: string;
  value: number | string | null;
}

export interface FixtureTeamStatistics {
  team: { id: number; name: string; logo: string };
  statistics: ApiStatistic[];
}

async function apiGet<T>(
  path: string,
  params: Record<string, unknown>
): Promise<T[]> {
  if (!API_KEY) {
    throw new Error(
      "API_FOOTBALL_KEY is missing. Add it to .env.local and restart the dev server."
    );
  }

  const { data } = await client.get(path, { params });

  const errs = data?.errors;
  const hasErrors = Array.isArray(errs)
    ? errs.length > 0
    : errs && Object.keys(errs).length > 0;

  if (hasErrors) {
    throw new Error(`API-Football error: ${JSON.stringify(errs)}`);
  }

  return data.response as T[];
}

export async function getFixturesByDate(date: string) {
  return apiGet<Fixture>("/fixtures", { date });
}

// Free plans only allow yesterday, today, and tomorrow, so the default
// is 2 days (today and tomorrow). Raise it on a paid plan.
export async function getUpcomingFixtures(days = 2) {
  const dates = Array.from({ length: days }, (_, i) =>
    format(addDays(new Date(), i), "yyyy-MM-dd")
  );

  // allSettled keeps the days that worked if one date is rejected.
  const settled = await Promise.allSettled(
    dates.map((date) => getFixturesByDate(date))
  );

  const fulfilled = settled.filter(
    (r): r is PromiseFulfilledResult<Fixture[]> => r.status === "fulfilled"
  );

  if (fulfilled.length === 0) {
    const firstFailure = settled.find(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    throw firstFailure?.reason ?? new Error("No fixtures returned");
  }

  return fulfilled.flatMap((r) => r.value);
}

export async function getFixtureById(id: number) {
  const res = await apiGet<Fixture>("/fixtures", { id });
  return res[0];
}

// Statistics for a finished match never change, so they are cached
// in memory to protect the daily request quota.
const statsCache = new Map<number, FixtureTeamStatistics[]>();

export async function getFixtureStatistics(
  fixtureId: number
): Promise<FixtureTeamStatistics[]> {
  const hit = statsCache.get(fixtureId);
  if (hit) return hit;

  const res = await apiGet<FixtureTeamStatistics>("/fixtures/statistics", {
    fixture: fixtureId,
  });

  if (res.length > 0) statsCache.set(fixtureId, res);
  return res;
}