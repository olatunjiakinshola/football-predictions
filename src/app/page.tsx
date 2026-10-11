"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, isToday, isTomorrow } from "date-fns";

interface Pick {
  expected: number;
  line: string;
  over: number | null;
  confidence: string;
}

interface Team {
  id: number;
  name: string;
  logo: string;
}

interface UpcomingFixture {
  fixture: { id: number; date: string };
  league: { id: number; name: string; country: string };
  teams: { home: Team; away: Team };
  headline: {
    goals: Pick | null;
    corners: Pick | null;
    cards: Pick | null;
    shotsOnTarget: Pick | null;
  } | null;
  gamesUsed: number;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEEE, d MMMM");
}

function StatChip({ label, pick }: { label: string; pick: Pick | null }) {
  if (!pick) {
    return (
      <div className="rounded-lg bg-gray-800/50 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-gray-500">
          {label}
        </div>
        <div className="text-sm text-gray-600 mt-1">Not enough data</div>
      </div>
    );
  }

  const pct = pick.over === null ? null : Math.round(pick.over * 100);

  return (
    <div className="rounded-lg bg-gray-800/50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="font-mono text-sm mt-1">
        {pick.expected.toFixed(1)}{" "}
        <span className="text-gray-500 text-xs">expected</span>
      </div>
      {pct === null ? (
        <div className="text-xs text-gray-600 mt-1">No percentage yet</div>
      ) : (
        <>
          <div className="text-xs text-gray-400 mt-1">
            Over {pick.line}: <span className="text-gray-200">{pct}%</span>
          </div>
          <div className="h-1 rounded-full bg-gray-700 mt-1.5 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 animate-pulse">
      <div className="h-5 w-2/3 bg-gray-800 rounded mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-gray-800/60 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [fixtures, setFixtures] = useState<UpcomingFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("all");

  useEffect(() => {
    fetch("/api/upcoming")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) {
          throw new Error(data?.error ?? "Unexpected response from server");
        }
        setFixtures(data);
      })
      .catch((e) => setError(e.message || "Failed to load fixtures"))
      .finally(() => setLoading(false));
  }, []);

  const leagues = useMemo(
    () => Array.from(new Set(fixtures.map((f) => f.league.name))),
    [fixtures]
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();

    const visible = fixtures.filter((f) => {
      if (league !== "all" && f.league.name !== league) return false;
      if (!q) return true;

      return (
        f.teams.home.name.toLowerCase().includes(q) ||
        f.teams.away.name.toLowerCase().includes(q) ||
        f.league.name.toLowerCase().includes(q)
      );
    });

    const map = new Map<string, { label: string; items: UpcomingFixture[] }>();

    for (const f of visible) {
      const key = format(new Date(f.fixture.date), "yyyy-MM-dd");
      if (!map.has(key)) {
        map.set(key, { label: dayLabel(f.fixture.date), items: [] });
      }
      map.get(key)!.items.push(f);
    }

    return Array.from(map.values());
  }, [fixtures, query, league]);

  const visibleCount = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="min-h-dvh bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-900/70">
        <div className="max-w-6xl mx-auto px-4 pt-6 pb-4">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Match Stats Predictor
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Expected goals, corners, cards and shots for every upcoming match,
            built from recent results.
          </p>
        </div>
      </header>

      <div className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a team or league"
            className="w-full h-11 rounded-lg bg-gray-800 border border-gray-700 px-4 text-base sm:text-sm placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
          />

          {leagues.length > 0 && (
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {["all", ...leagues].map((name) => (
                <button
                  key={name}
                  onClick={() => setLeague(name)}
                  className={`shrink-0 min-h-10 rounded-full px-4 text-sm border transition ${
                    league === name
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-gray-900 border-gray-700 text-gray-300 active:border-gray-500"
                  }`}
                >
                  {name === "all" ? "All leagues" : name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-8">
        {error && (
          <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="grid gap-4">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!loading &&
          groups.map((group) => (
            <section key={group.label}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
                {group.label}
              </h2>

              <div className="grid gap-4">
                {group.items.map((f) => (
                  <Link
                    key={f.fixture.id}
                    href={`/match/${f.fixture.id}`}
                    className="block bg-gray-900 active:bg-gray-800 sm:hover:bg-gray-800/80 border border-gray-800 rounded-xl p-4 sm:p-5 transition"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs text-gray-400 mb-3">
                      <span className="uppercase tracking-wider truncate">
                        {f.league.name}
                      </span>
                      <span className="font-mono shrink-0">
                        {format(new Date(f.fixture.date), "HH:mm")}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <div className="flex items-center gap-3 min-w-0 sm:flex-1">
                        <img
                          src={f.teams.home.logo}
                          alt=""
                          className="w-9 h-9 object-contain shrink-0"
                        />
                        <span className="font-medium truncate">
                          {f.teams.home.name}
                        </span>
                      </div>

                      <span className="hidden sm:block text-gray-600 text-sm shrink-0">
                        vs
                      </span>

                      <div className="flex items-center gap-3 min-w-0 sm:flex-1 sm:flex-row-reverse sm:justify-start">
                        <img
                          src={f.teams.away.logo}
                          alt=""
                          className="w-9 h-9 object-contain shrink-0"
                        />
                        <span className="font-medium truncate sm:text-right">
                          {f.teams.away.name}
                        </span>
                      </div>
                    </div>

                    {f.headline ? (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                          <StatChip label="Goals" pick={f.headline.goals} />
                          <StatChip label="Corners" pick={f.headline.corners} />
                          <StatChip
                            label="Yellow cards"
                            pick={f.headline.cards}
                          />
                          <StatChip
                            label="Shots on target"
                            pick={f.headline.shotsOnTarget}
                          />
                        </div>

                        {f.gamesUsed < 5 && (
                          <p className="text-xs text-amber-300/80 mt-3">
                            Limited data for one of these teams, so treat these
                            numbers with extra caution.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-gray-500 mt-3">
                        Open the match to load predictions.
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))}

        {!loading && !error && visibleCount === 0 && (
          <p className="text-center text-gray-500 py-20">
            {fixtures.length === 0
              ? "No upcoming matches in the next 7 days."
              : "No matches fit that search or league filter."}
          </p>
        )}

        <p className="text-xs text-gray-500 text-center pt-4 border-t border-gray-800">
          Statistical estimates from past results only. They are not guarantees
          and no outcome is certain. Betting carries financial risk. 18+ only.
        </p>
      </main>
    </div>
  );
}