import type { Fixture } from "./api-football";
import {
  STAT_TYPES,
  type AveragesInput,
  type Predictions,
  type StatKey,
} from "./predictions";
import { updatePredictions, type StoredPrediction } from "./prediction-store";

const FINISH_GRACE_MS = 3 * 60 * 60 * 1000;
const MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;
const STRONG_CALL = 0.65;
const RECENT_KEYS: StatKey[] = ["goals", "corners", "yellowCards", "shotsOnTarget"];

const LABELS = Object.fromEntries(
  STAT_TYPES.map((s) => [s.key, s.label])
) as Record<StatKey, string>;

// ---------- saving predictions ----------

function snapshot(fixture: Fixture, predictions: Predictions): StoredPrediction {
  const stats: StoredPrediction["stats"] = {};

  for (const s of STAT_TYPES) {
    const p = predictions[s.key];
    if (!p || p.total === null) continue;

    stats[s.key] = {
      total: p.total,
      overProb: p.overProb,
      confidence: p.confidence,
      sampleSize: p.sampleSize,
    };
  }

  return {
    fixtureId: fixture.fixture.id,
    kickoff: fixture.fixture.date,
    createdAt: new Date().toISOString(),
    league: fixture.league.name,
    homeId: fixture.teams.home.id,
    awayId: fixture.teams.away.id,
    home: fixture.teams.home.name,
    away: fixture.teams.away.name,
    stats,
    result: null,
  };
}

// Only matches that have not kicked off are saved, and a saved prediction
// is never overwritten.
export async function recordFixtures(
  items: { fixture: Fixture; predictions: Predictions }[]
): Promise<number> {
  const now = Date.now();
  const fresh = items.filter(
    (i) => new Date(i.fixture.fixture.date).getTime() > now
  );

  if (fresh.length === 0) return 0;

  let added = 0;

  await updatePredictions((all) => {
    const known = new Set(all.map((p) => p.fixtureId));

    for (const item of fresh) {
      if (known.has(item.fixture.fixture.id)) continue;

      const snap = snapshot(item.fixture, item.predictions);
      if (Object.keys(snap.stats).length === 0) continue;

      all.push(snap);
      known.add(snap.fixtureId);
      added++;
    }

    return added > 0;
  });

  return added;
}

// ---------- scoring against real results ----------

function statValue(
  list: { type: string; value: number | string | null }[],
  type: string
): number | null {
  const found = list.find((x) => x.type === type);
  return typeof found?.value === "number" ? found.value : null;
}

function actualTotals(match: AveragesInput): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};

  const home =
    match.statistics.find((s) => s.team.id === match.teams.home.id)
      ?.statistics ?? [];
  const away =
    match.statistics.find((s) => s.team.id === match.teams.away.id)
      ?.statistics ?? [];

  for (const s of STAT_TYPES) {
    if (s.key === "goals") {
      if (match.goals.home !== null && match.goals.away !== null) {
        out.goals = match.goals.home + match.goals.away;
      }
      continue;
    }

    if (!s.api) continue;

    const h = statValue(home, s.api);
    const a = statValue(away, s.api);
    if (h !== null && a !== null) out[s.key] = h + a;
  }

  return out;
}

export async function settleFinished(history: AveragesInput[]): Promise<number> {
  const now = Date.now();
  let settled = 0;

  await updatePredictions((all) => {
    for (const p of all) {
      if (p.result) continue;

      const kickoff = new Date(p.kickoff).getTime();
      if (now < kickoff + FINISH_GRACE_MS) continue;

      const match = history.find(
        (m) =>
          m.teams.home.id === p.homeId &&
          m.teams.away.id === p.awayId &&
          Math.abs(new Date(m.fixture.date).getTime() - kickoff) <
            MATCH_WINDOW_MS
      );

      if (!match) continue;

      p.result = {
        settledAt: new Date().toISOString(),
        homeGoals: match.goals.home,
        awayGoals: match.goals.away,
        actual: actualTotals(match),
      };
      settled++;
    }

    return settled > 0;
  });

  return settled;
}

// ---------- the report ----------

export interface StatSummary {
  key: StatKey;
  label: string;
  matches: number;
  calls: number;
  mae: number | null;
  brier: number | null;
  hitRate: number | null;
}

export interface CalibrationBin {
  from: number;
  to: number;
  calls: number;
  predicted: number;
  actual: number;
}

export interface RecentMatch {
  fixtureId: number;
  kickoff: string;
  league: string;
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  rows: { label: string; expected: number; actual: number }[];
}

export interface TrackReport {
  stored: number;
  settled: number;
  pending: number;
  firstRecorded: string | null;
  calls: number;
  brier: number | null;
  hitRate: number | null;
  strong: { calls: number; hitRate: number | null };
  stats: StatSummary[];
  calibration: CalibrationBin[];
  recent: RecentMatch[];
}

type Pair = { p: number; o: number };

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

const brierOf = (pairs: Pair[]) => mean(pairs.map((x) => (x.p - x.o) ** 2));

const hitOf = (pairs: Pair[]) =>
  pairs.length
    ? pairs.filter((x) => x.p >= 0.5 === (x.o === 1)).length / pairs.length
    : null;

export function buildReport(all: StoredPrediction[]): TrackReport {
  const settled = all.filter((p) => p.result);
  const everyPair: Pair[] = [];
  const perStat = new Map<
    StatKey,
    { pairs: Pair[]; errors: number[]; matches: number }
  >();

  for (const pred of settled) {
    const actual = pred.result!.actual;

    for (const s of STAT_TYPES) {
      const sp = pred.stats[s.key];
      const real = actual[s.key];
      if (!sp || real === undefined) continue;

      const bucket = perStat.get(s.key) ?? { pairs: [], errors: [], matches: 0 };
      bucket.matches++;
      bucket.errors.push(Math.abs(sp.total - real));

      for (const [line, prob] of Object.entries(sp.overProb)) {
        if (prob === null) continue;
        const pair = { p: prob, o: real > Number(line) ? 1 : 0 };
        bucket.pairs.push(pair);
        everyPair.push(pair);
      }

      perStat.set(s.key, bucket);
    }
  }

  const stats: StatSummary[] = STAT_TYPES.flatMap((s) => {
    const b = perStat.get(s.key);
    if (!b) return [];

    return [
      {
        key: s.key,
        label: s.label,
        matches: b.matches,
        calls: b.pairs.length,
        mae: mean(b.errors),
        brier: brierOf(b.pairs),
        hitRate: hitOf(b.pairs),
      },
    ];
  });

  const strongPairs = everyPair.filter(
    (x) => Math.max(x.p, 1 - x.p) >= STRONG_CALL
  );

  const calibration: CalibrationBin[] = Array.from({ length: 10 }, (_, i) => {
    const inBin = everyPair.filter(
      (x) => Math.min(9, Math.floor(x.p * 10)) === i
    );

    return {
      from: i / 10,
      to: (i + 1) / 10,
      calls: inBin.length,
      predicted: mean(inBin.map((x) => x.p)) ?? 0,
      actual: mean(inBin.map((x) => x.o)) ?? 0,
    };
  }).filter((b) => b.calls > 0);

  const recent: RecentMatch[] = settled
    .slice()
    .sort((a, b) => +new Date(b.kickoff) - +new Date(a.kickoff))
    .slice(0, 8)
    .map((p) => ({
      fixtureId: p.fixtureId,
      kickoff: p.kickoff,
      league: p.league,
      home: p.home,
      away: p.away,
      homeGoals: p.result!.homeGoals,
      awayGoals: p.result!.awayGoals,
      rows: RECENT_KEYS.flatMap((key) => {
        const sp = p.stats[key];
        const real = p.result!.actual[key];
        if (!sp || real === undefined) return [];
        return [{ label: LABELS[key], expected: sp.total, actual: real }];
      }),
    }));

  const created = all.map((p) => p.createdAt).sort();

  return {
    stored: all.length,
    settled: settled.length,
    pending: all.length - settled.length,
    firstRecorded: created[0] ?? null,
    calls: everyPair.length,
    brier: brierOf(everyPair),
    hitRate: hitOf(everyPair),
    strong: { calls: strongPairs.length, hitRate: hitOf(strongPairs) },
    stats,
    calibration,
    recent,
  };
}