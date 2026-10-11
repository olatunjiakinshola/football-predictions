import { promises as fs } from "fs";
import path from "path";
import type { Confidence, StatKey } from "./predictions";

export interface StoredStat {
  total: number;
  overProb: Record<string, number | null>;
  confidence: Confidence;
  sampleSize: number;
}

export interface StoredPrediction {
  fixtureId: number;
  kickoff: string;
  createdAt: string;
  league: string;
  homeId: number;
  awayId: number;
  home: string;
  away: string;
  stats: Partial<Record<StatKey, StoredStat>>;
  result: null | {
    settledAt: string;
    homeGoals: number | null;
    awayGoals: number | null;
    actual: Partial<Record<StatKey, number>>;
  };
}

// ---------- Redis (Upstash) over its REST API ----------

const HASH = "predictions";

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(commands: string[][]): Promise<unknown[]> {
  const config = redisConfig();
  if (!config) throw new Error("Redis is not configured");

  const res = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Redis request failed (${res.status})`);

  const out = (await res.json()) as { result?: unknown; error?: string }[];
  const failed = out.find((o) => o.error);
  if (failed) throw new Error(`Redis error: ${failed.error}`);

  return out.map((o) => o.result);
}

function parseHash(raw: unknown): StoredPrediction[] {
  const values: unknown[] = [];

  if (Array.isArray(raw)) {
    for (let i = 1; i < raw.length; i += 2) values.push(raw[i]);
  } else if (raw && typeof raw === "object") {
    values.push(...Object.values(raw as Record<string, unknown>));
  }

  return values.map((v) =>
    typeof v === "string" ? (JSON.parse(v) as StoredPrediction) : (v as StoredPrediction)
  );
}

async function redisRead(): Promise<StoredPrediction[]> {
  const [raw] = await redis([["HGETALL", HASH]]);
  return parseHash(raw);
}

// Each prediction is its own hash field. New ones use HSETNX, so a saved
// prediction can never be overwritten by a second request.
async function redisUpdate(mutate: (all: StoredPrediction[]) => boolean) {
  const all = await redisRead();
  const before = new Map(all.map((p) => [p.fixtureId, JSON.stringify(p)]));

  if (!mutate(all)) return;

  const commands: string[][] = [];

  for (const p of all) {
    const json = JSON.stringify(p);
    const old = before.get(p.fixtureId);

    if (old === undefined) {
      commands.push(["HSETNX", HASH, String(p.fixtureId), json]);
    } else if (old !== json) {
      commands.push(["HSET", HASH, String(p.fixtureId), json]);
    }
  }

  if (commands.length > 0) await redis(commands);
}

// ---------- JSON file (local development) ----------

const FILE = path.join(process.cwd(), "data", "predictions.json");

let queue: Promise<unknown> = Promise.resolve();

function locked<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function fileLoad(): Promise<StoredPrediction[]> {
  let raw: string;

  try {
    raw = await fs.readFile(FILE, "utf8");
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }

  return JSON.parse(raw) as StoredPrediction[];
}

function fileUpdate(mutate: (all: StoredPrediction[]) => boolean) {
  return locked(async () => {
    const all = await fileLoad();
    if (!mutate(all)) return;

    await fs.mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(all));
    await fs.rename(tmp, FILE);
  });
}

// ---------- public API ----------

function assertStorage() {
  if (process.env.VERCEL && !redisConfig()) {
    throw new Error(
      "No Redis database is connected. Add an Upstash Redis database to this Vercel project and redeploy."
    );
  }
}

export function readPredictions(): Promise<StoredPrediction[]> {
  assertStorage();
  return redisConfig() ? redisRead() : locked(fileLoad);
}

// The mutator edits the list in place and returns true when something changed.
export function updatePredictions(
  mutate: (all: StoredPrediction[]) => boolean
): Promise<void> {
  assertStorage();
  return redisConfig() ? redisUpdate(mutate) : fileUpdate(mutate);
}