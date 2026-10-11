"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { STAT_TYPES } from "@/lib/predictions";

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-900/40 text-emerald-300 border-emerald-700/40",
  medium: "bg-blue-900/40 text-blue-300 border-blue-700/40",
  low: "bg-amber-900/40 text-amber-300 border-amber-700/40",
  insufficient: "bg-gray-800 text-gray-400 border-gray-700",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  insufficient: "Not enough data",
};

function MatchView() {
  const params = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/match/${params.id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.error) setError(res.error);
        else setData(res);
      })
      .catch(() => setError("Failed to load predictions"))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-gray-950 text-white flex items-center justify-center px-6 text-center">
        <p>Calculating predictions from historical data...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-dvh bg-gray-950 text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-red-400">{error || "Something went wrong"}</p>
        <Link href="/" className="text-blue-400 underline min-h-11 flex items-center">
          ← Back to matches
        </Link>
      </div>
    );
  }

  const {
    fixture,
    predictions,
    homeGamesUsed,
    awayGamesUsed,
    homeVenueUsed,
    awayVenueUsed,
  } = data;

  const available = STAT_TYPES.filter(
    (s) => typeof predictions[s.key]?.total === "number"
  );

  const unavailable = STAT_TYPES.filter(
    (s) => predictions[s.key]?.total === null
  ).map((s) => s.label.toLowerCase());

  return (
    <div className="min-h-dvh bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-5xl mx-auto px-4 py-4 sm:py-6">
          <Link
            href="/"
            className="inline-flex items-center min-h-11 text-sm text-gray-400 hover:text-white"
          >
            ← All matches
          </Link>

          <div className="text-center">
            <div className="text-xs sm:text-sm text-gray-400">
              {fixture.league.name}
            </div>
            <div className="font-mono text-base sm:text-lg mt-0.5">
              {format(new Date(fixture.fixture.date), "EEE dd MMM · HH:mm")}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 mt-5">
            <div className="flex flex-col items-center text-center gap-2 min-w-0">
              <img
                src={fixture.teams.home.logo}
                className="w-14 h-14 sm:w-16 sm:h-16"
                alt=""
              />
              <div className="font-bold text-base sm:text-xl leading-tight break-words">
                {fixture.teams.home.name}
              </div>
              <div className="text-xs text-gray-400">
                Last {homeGamesUsed} {homeVenueUsed ? "home games" : "games"}
              </div>
            </div>

            <div className="pt-5 text-sm text-gray-600">vs</div>

            <div className="flex flex-col items-center text-center gap-2 min-w-0">
              <img
                src={fixture.teams.away.logo}
                className="w-14 h-14 sm:w-16 sm:h-16"
                alt=""
              />
              <div className="font-bold text-base sm:text-xl leading-tight break-words">
                {fixture.teams.away.name}
              </div>
              <div className="text-xs text-gray-400">
                Last {awayGamesUsed} {awayVenueUsed ? "away games" : "games"}
              </div>
            </div>
          </div>
        </div>
      </header>

      {available.length > 0 && (
        <div className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/90 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {available.map((s) => (
              <a
                key={s.key}
                href={`#${s.key}`}
                className="shrink-0 inline-flex items-center min-h-10 rounded-full px-4 text-sm border border-gray-700 bg-gray-900 text-gray-300 active:border-gray-500"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-5 sm:space-y-8">
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 text-sm text-amber-200">
          <strong>Disclaimer:</strong> These are statistical projections based
          on recent averages only. They are <strong>not</strong> guarantees.
          Always do your own research. Gambling involves risk.
        </div>

        {(homeGamesUsed < 3 || awayGamesUsed < 3) && (
          <div className="bg-blue-900/20 border border-blue-700/40 rounded-xl p-4 text-sm text-blue-200">
            One of these teams has few stored games, so some percentages are
            hidden.
          </div>
        )}

        {available.map((stat) => {
          const p = predictions[stat.key];

          return (
            <section
              key={stat.key}
              id={stat.key}
              className="scroll-mt-16 bg-gray-900 border border-gray-800 rounded-2xl p-4 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-lg font-semibold">{stat.label}</h2>
                <span
                  className={`text-xs border rounded-full px-3 py-1 ${
                    CONFIDENCE_STYLES[p.confidence]
                  }`}
                >
                  {CONFIDENCE_LABELS[p.confidence]}
                  {p.sampleSize > 0 ? ` · ${p.sampleSize} games` : ""}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-5 text-center">
                <div>
                  <div className="text-2xl sm:text-3xl font-bold text-blue-400">
                    {p.home ?? "–"}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Home expected</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-bold">{p.total}</div>
                  <div className="text-xs text-gray-400 mt-1">Total expected</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-bold text-emerald-400">
                    {p.away ?? "–"}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Away expected</div>
                </div>
              </div>

              {p.confidence === "insufficient" ? (
                <p className="text-sm text-gray-500">
                  Too few games to show over/under percentages.
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(p.overProb).map(([line, prob]) => {
                    const over =
                      typeof prob === "number" ? Math.round(prob * 100) : null;

                    return (
                      <div key={line}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-300">Over {line}</span>
                          <span className="font-mono">
                            {over === null ? "–" : `${over}%`}
                            {over !== null && (
                              <span className="text-gray-500 text-xs ml-2">
                                Under {100 - over}%
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-800 mt-1.5 overflow-hidden">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${over ?? 0}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {unavailable.length > 0 && (
          <p className="text-sm text-gray-500">
            Not available from the free data source: {unavailable.join(", ")}.
          </p>
        )}

        <Link
          href="/track-record"
          className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-4 min-h-14 text-sm text-gray-300 active:bg-gray-800"
        >
          <span>See how past predictions scored</span>
          <span aria-hidden="true">→</span>
        </Link>
      </main>
    </div>
  );
}

export default function MatchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-gray-950 text-white flex items-center justify-center">
          <p>Loading match...</p>
        </div>
      }
    >
      <MatchView />
    </Suspense>
  );
}