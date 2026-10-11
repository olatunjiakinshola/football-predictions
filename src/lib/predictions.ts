import type {
  ApiStatistic,
  Fixture,
  FixtureTeamStatistics,
} from "./api-football";

// Set to true to see predictions with 1 to 2 stored games per team.
// Percentages from so few games are unreliable. Use it to check the layout,
// then set it back to false.
const TEST_MODE = false;

const MIN_SAMPLE = TEST_MODE ? 1 : 3;
const MIN_VENUE_GAMES = TEST_MODE ? 1 : 4;

// dispersion is the negative binomial size parameter r.
// Variance = mean + mean^2 / r, so a lower r means more spread than Poisson.
// null means plain Poisson. These are starting values to tune with backtesting.
export const STAT_TYPES = [
  { key: "goals", label: "Goals", api: null, dispersion: null, lines: ["0.5", "1.5", "2.5", "3.5"] },
  { key: "totalShots", label: "Total shots", api: "Total Shots", dispersion: 37, lines: ["15.5", "19.5", "22.5", "25.5", "29.5"] },
  { key: "shotsOnTarget", label: "Shots on target", api: "Shots on Goal", dispersion: 27, lines: ["5.5", "7.5", "8.5", "9.5", "11.5"] },
  { key: "shotsOffTarget", label: "Shots off target", api: "Shots off Goal", dispersion: 25, lines: ["5.5", "7.5", "9.5", "11.5"] },
  { key: "blockedShots", label: "Blocked shots", api: "Blocked Shots", dispersion: 18, lines: ["2.5", "3.5", "4.5", "5.5"] },
  { key: "corners", label: "Corner kicks", api: "Corner Kicks", dispersion: 200, lines: ["7.5", "8.5", "9.5", "10.5", "11.5"] },
  { key: "fouls", label: "Fouls", api: "Fouls", dispersion: 150, lines: ["18.5", "21.5", "23.5", "25.5"] },
  { key: "yellowCards", label: "Yellow cards", api: "Yellow Cards", dispersion: 40, lines: ["1.5", "2.5", "3.5", "4.5"] },
  { key: "redCards", label: "Red cards", api: "Red Cards", dispersion: null, lines: ["0.5", "1.5"] },
  { key: "goalKicks", label: "Goal kicks", api: "Goal Kicks", dispersion: 60, lines: ["10.5", "12.5", "14.5", "16.5"] },
  { key: "saves", label: "Goalkeeper saves", api: "Goalkeeper Saves", dispersion: 64, lines: ["3.5", "4.5", "5.5", "6.5"] },
  { key: "offsides", label: "Offsides", api: "Offsides", dispersion: 30, lines: ["1.5", "2.5", "3.5", "4.5"] },
] as const;

export type StatKey = (typeof STAT_TYPES)[number]["key"];
export type Venue = "home" | "away" | "all";
export type Confidence = "high" | "medium" | "low" | "insufficient";

export interface TeamAverages {
  for: Record<StatKey, number | null>;
  against: Record<StatKey, number | null>;
  samples: Record<StatKey, { for: number; against: number }>;
  games: number;
}

export interface StatPrediction {
  home: number | null;
  away: number | null;
  total: number | null;
  overProb: Record<string, number | null>;
  sampleSize: number;
  confidence: Confidence;
}

export type Predictions = Record<StatKey, StatPrediction>;

export interface AveragesInput {
  fixture: Fixture["fixture"];
  teams: Fixture["teams"];
  goals: Fixture["goals"];
  statistics: FixtureTeamStatistics[];
}

function emptyNumbers(): Record<StatKey, number> {
  return Object.fromEntries(
    STAT_TYPES.map((s) => [s.key, 0])
  ) as Record<StatKey, number>;
}

function emptyAverages(): TeamAverages {
  return {
    for: Object.fromEntries(
      STAT_TYPES.map((s) => [s.key, null])
    ) as Record<StatKey, number | null>,
    against: Object.fromEntries(
      STAT_TYPES.map((s) => [s.key, null])
    ) as Record<StatKey, number | null>,
    samples: Object.fromEntries(
      STAT_TYPES.map((s) => [s.key, { for: 0, against: 0 }])
    ) as TeamAverages["samples"],
    games: 0,
  };
}

function numericValue(value: ApiStatistic["value"]): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number(value.replace("%", "").trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function findStat(statistics: ApiStatistic[], type: string): number | null {
  const found = statistics.find((s) => s.type === type);
  return found ? numericValue(found.value) : null;
}

function add(
  sums: Record<StatKey, number>,
  averages: TeamAverages,
  key: StatKey,
  side: "for" | "against",
  value: number | null
) {
  if (value === null) return;

  sums[key] += value;
  averages.samples[key][side] += 1;
}

export function calculateAverages(
  fixtures: AveragesInput[],
  teamId: number,
  venue: Venue = "all"
): TeamAverages {
  const result = emptyAverages();
  const forSums = emptyNumbers();
  const againstSums = emptyNumbers();

  for (const fixture of fixtures) {
    const isHome = fixture.teams.home.id === teamId;

    if (!isHome && fixture.teams.away.id !== teamId) continue;
    if (venue === "home" && !isHome) continue;
    if (venue === "away" && isHome) continue;

    const teamStats = fixture.statistics.find(
      (s) => s.team.id === teamId
    )?.statistics;

    const opponentStats = fixture.statistics.find(
      (s) => s.team.id !== teamId
    )?.statistics;

    // Scores come from the fixture even when detailed statistics are missing.
    const goalsFor = isHome ? fixture.goals.home : fixture.goals.away;
    const goalsAgainst = isHome ? fixture.goals.away : fixture.goals.home;

    add(forSums, result, "goals", "for", goalsFor);
    add(againstSums, result, "goals", "against", goalsAgainst);

    if (goalsFor !== null && goalsAgainst !== null) {
      result.games += 1;
    }

    for (const stat of STAT_TYPES) {
      if (stat.key === "goals" || !stat.api) continue;

      const ownValue = teamStats ? findStat(teamStats, stat.api) : null;
      const opponentValue = opponentStats
        ? findStat(opponentStats, stat.api)
        : null;

      add(forSums, result, stat.key, "for", ownValue);
      add(againstSums, result, stat.key, "against", opponentValue);
    }
  }

  for (const stat of STAT_TYPES) {
    const key = stat.key;
    const forCount = result.samples[key].for;
    const againstCount = result.samples[key].against;

    result.for[key] = forCount
      ? Number((forSums[key] / forCount).toFixed(2))
      : null;

    result.against[key] = againstCount
      ? Number((againstSums[key] / againstCount).toFixed(2))
      : null;
  }

  return result;
}

// Uses the venue-specific split when it has enough games,
// and falls back to all recent games otherwise.
export function pickVenueAverages(
  fixtures: AveragesInput[],
  teamId: number,
  venue: "home" | "away"
): { averages: TeamAverages; venueUsed: boolean } {
  const split = calculateAverages(fixtures, teamId, venue);

  if (split.games >= MIN_VENUE_GAMES) {
    return { averages: split, venueUsed: true };
  }

  return {
    averages: calculateAverages(fixtures, teamId, "all"),
    venueUsed: false,
  };
}

// Team average "for" combined with the opponent's average "against".
// If only one side exists, it is used on its own.
function expectedValue(
  ownFor: number | null,
  opponentAgainst: number | null
): number | null {
  if (ownFor !== null && opponentAgainst !== null) {
    return (ownFor + opponentAgainst) / 2;
  }

  return ownFor ?? opponentAgainst;
}

// P(X > line) for a count with mean mu.
// r = null gives Poisson. A number gives negative binomial with size r.
export function countOver(
  mu: number,
  line: number,
  r: number | null
): number | null {
  if (!Number.isFinite(mu) || mu < 0) return null;

  const lastUnder = Math.floor(line);
  let p = r === null ? Math.exp(-mu) : Math.pow(r / (r + mu), r);
  let cdf = p;

  for (let k = 0; k < lastUnder; k++) {
    p =
      r === null
        ? (p * mu) / (k + 1)
        : p * ((k + r) / (k + 1)) * (mu / (r + mu));
    cdf += p;
  }

  return Number(Math.max(0, Math.min(1, 1 - cdf)).toFixed(4));
}

export function poissonOver(lambda: number, line: number): number | null {
  return countOver(lambda, line, null);
}

function confidenceFor(sampleSize: number): Confidence {
  if (sampleSize >= 6) return "high";
  if (sampleSize >= 4) return "medium";
  if (sampleSize >= MIN_SAMPLE) return "low";
  return "insufficient";
}

export function predictMatch(
  homeAvg: TeamAverages,
  awayAvg: TeamAverages
): Predictions {
  const result = {} as Predictions;

  for (const stat of STAT_TYPES) {
    const key = stat.key;

    const home = expectedValue(homeAvg.for[key], awayAvg.against[key]);
    const away = expectedValue(awayAvg.for[key], homeAvg.against[key]);

    const total =
      home !== null && away !== null
        ? Number((home + away).toFixed(2))
        : null;

    // The weakest of the four inputs sets the sample size.
    const sampleSize = Math.min(
      homeAvg.samples[key].for,
      homeAvg.samples[key].against,
      awayAvg.samples[key].for,
      awayAvg.samples[key].against
    );

    const confidence =
      total === null ? "insufficient" : confidenceFor(sampleSize);

    const overProb: Record<string, number | null> = {};

    for (const line of stat.lines) {
      overProb[line] =
        total === null || confidence === "insufficient"
          ? null
          : countOver(total, Number(line), stat.dispersion);
    }

    result[key] = {
      home: home === null ? null : Number(home.toFixed(2)),
      away: away === null ? null : Number(away.toFixed(2)),
      total,
      overProb,
      sampleSize,
      confidence,
    };
  }

  return result;
}