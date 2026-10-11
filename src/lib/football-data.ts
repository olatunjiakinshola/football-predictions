import type { Fixture } from "./api-football";
import type { AveragesInput } from "./predictions";

const BASE = "https://www.football-data.co.uk";
const SEASONS_BACK = 3;
const CACHE_TTL = 6 * 60 * 60 * 1000;

export const LEAGUES = [
  { div: "E0", id: 39, name: "Premier League", country: "England" },
  { div: "SP1", id: 140, name: "La Liga", country: "Spain" },
  { div: "I1", id: 135, name: "Serie A", country: "Italy" },
  { div: "D1", id: 78, name: "Bundesliga", country: "Germany" },
  { div: "F1", id: 61, name: "Ligue 1", country: "France" },
];

type Row = Record<string, string>;

// ---------- helpers ----------

function hashId(text: string): number {
  let h = 5381;
  for (const ch of text) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h;
}

const crestCache = new Map<string, string>();

function crest(name: string): string {
  const hit = crestCache.get(name);
  if (hit) return hit;

  const initials = name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();
  const hue = hashId(name) % 360;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>` +
    `<circle cx='32' cy='32' r='32' fill='hsl(${hue},45%,32%)'/>` +
    `<text x='32' y='39' font-family='Arial' font-size='22' font-weight='700' ` +
    `fill='white' text-anchor='middle'>${initials}</text></svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  crestCache.set(name, uri);
  return uri;
}

function parseCsv(text: string): Row[] {
  const src = text.replace(/^\uFEFF/, "");
  const lines: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) lines.push(row);
      row = [];
    } else {
      field += c;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((x) => x !== "")) lines.push(row);
  }

  if (lines.length < 2) return [];

  const header = lines[0].map((h) => h.trim());

  return lines.slice(1).map((cells) => {
    const obj: Row = {};
    header.forEach((h, i) => {
      if (h) obj[h] = (cells[i] ?? "").trim();
    });
    return obj;
  });
}

function num(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// football-data.co.uk lists kickoff times in UK time.
function londonToUtc(y: number, m: number, d: number, hh: number, mm: number) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(guess));

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const asLondon = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute")
  );

  return new Date(guess - (asLondon - guess));
}

function parseDate(date: string | undefined, time: string | undefined) {
  const m = (date ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;

  let year = Number(m[3]);
  if (year < 100) year += 2000;

  const [hh, mm] = (time || "12:00").split(":").map(Number);

  return londonToUtc(year, Number(m[2]), Number(m[1]), hh || 0, mm || 0);
}

function seasonCodes(now = new Date()): string[] {
  const startYear =
    now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

  return Array.from({ length: SEASONS_BACK }, (_, i) => {
    const y = startYear - i;
    const a = String(y % 100).padStart(2, "0");
    const b = String((y + 1) % 100).padStart(2, "0");
    return `${a}${b}`;
  });
}

// ---------- download with cache ----------

const textCache = new Map<string, { text: string; at: number }>();

async function fetchText(url: string): Promise<string | null> {
  const hit = textCache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.text;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return hit?.text ?? null;

    const text = await res.text();
    textCache.set(url, { text, at: Date.now() });
    return text;
  } catch {
    // serve the old copy if the site is down
    return hit?.text ?? null;
  }
}

// ---------- past matches ----------

function savesEstimate(opponentOnTarget: number | null, opponentGoals: number) {
  if (opponentOnTarget === null) return null;
  return Math.max(0, opponentOnTarget - opponentGoals);
}

function toMatch(r: Row): AveragesInput | null {
  const homeName = r.HomeTeam;
  const awayName = r.AwayTeam;
  const hg = num(r.FTHG ?? r.HG);
  const ag = num(r.FTAG ?? r.AG);
  const date = parseDate(r.Date, r.Time);

  if (!homeName || !awayName || hg === null || ag === null || !date) {
    return null;
  }

  const home = { id: hashId(homeName), name: homeName, logo: crest(homeName) };
  const away = { id: hashId(awayName), name: awayName, logo: crest(awayName) };

  const homeStats = [
    { type: "Total Shots", value: num(r.HS) },
    { type: "Shots on Goal", value: num(r.HST) },
    { type: "Corner Kicks", value: num(r.HC) },
    { type: "Fouls", value: num(r.HF) },
    { type: "Yellow Cards", value: num(r.HY) },
    { type: "Red Cards", value: num(r.HR) },
    { type: "Goalkeeper Saves", value: savesEstimate(num(r.AST), ag) },
  ];

  const awayStats = [
    { type: "Total Shots", value: num(r.AS) },
    { type: "Shots on Goal", value: num(r.AST) },
    { type: "Corner Kicks", value: num(r.AC) },
    { type: "Fouls", value: num(r.AF) },
    { type: "Yellow Cards", value: num(r.AY) },
    { type: "Red Cards", value: num(r.AR) },
    { type: "Goalkeeper Saves", value: savesEstimate(num(r.HST), hg) },
  ];

  return {
    fixture: {
      id: hashId(`${r.Div}|${r.Date}|${homeName}|${awayName}`),
      date: date.toISOString(),
      status: { short: "FT" },
    },
    teams: { home, away },
    goals: { home: hg, away: ag },
    statistics: [
      { team: home, statistics: homeStats },
      { team: away, statistics: awayStats },
    ],
  };
}

let historyCache: { data: AveragesInput[]; at: number } | null = null;

export async function loadHistory(): Promise<AveragesInput[]> {
  if (historyCache && Date.now() - historyCache.at < CACHE_TTL) {
    return historyCache.data;
  }

  const jobs: string[] = [];
  for (const league of LEAGUES) {
    for (const code of seasonCodes()) {
      jobs.push(`${BASE}/mmz4281/${code}/${league.div}.csv`);
    }
  }

  const texts = await Promise.all(jobs.map(fetchText));
  const matches: AveragesInput[] = [];

  for (const text of texts) {
    if (!text) continue;
    for (const row of parseCsv(text)) {
      const match = toMatch(row);
      if (match) matches.push(match);
    }
  }

  if (matches.length === 0) {
    throw new Error("Could not load match history from football-data.co.uk");
  }

  // newest first
  matches.sort(
    (a, b) =>
      new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime()
  );

  historyCache = { data: matches, at: Date.now() };
  return matches;
}

export function lastGamesForTeam(
  history: AveragesInput[],
  teamId: number,
  n = 20
): AveragesInput[] {
  return history
    .filter((m) => m.teams.home.id === teamId || m.teams.away.id === teamId)
    .slice(0, n);
}

// ---------- upcoming matches ----------

export async function loadUpcoming(days = 7): Promise<Fixture[]> {
  const text = await fetchText(`${BASE}/fixtures.csv`);
  if (!text) {
    throw new Error("Could not load fixtures from football-data.co.uk");
  }

  const now = Date.now();
  const from = now - 3 * 60 * 60 * 1000; // keep matches in play for 3 hours
  const to = now + days * 24 * 60 * 60 * 1000;

  const out: Fixture[] = [];

  for (const r of parseCsv(text)) {
    const league = LEAGUES.find((l) => l.div === r.Div);
    const date = parseDate(r.Date, r.Time);

    if (!league || !date || !r.HomeTeam || !r.AwayTeam) continue;

    const t = date.getTime();
    if (t < from || t > to) continue;

    out.push({
      fixture: {
        id: hashId(`${r.Div}|${r.Date}|${r.HomeTeam}|${r.AwayTeam}`),
        date: date.toISOString(),
        status: { short: "NS" },
      },
      league: {
        id: league.id,
        name: league.name,
        country: league.country,
        logo: "",
      },
      teams: {
        home: { id: hashId(r.HomeTeam), name: r.HomeTeam, logo: crest(r.HomeTeam) },
        away: { id: hashId(r.AwayTeam), name: r.AwayTeam, logo: crest(r.AwayTeam) },
      },
      goals: { home: null, away: null },
    });
  }

  return out.sort(
    (a, b) =>
      new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime()
  );
}