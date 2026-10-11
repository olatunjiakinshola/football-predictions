"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import type { TrackReport } from "@/lib/track-record";

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
const dec = (v: number | null, digits = 3) =>
  v === null ? "–" : v.toFixed(digits);

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-bold font-mono mt-1">{value}</div>
      {note && <div className="text-xs text-gray-500 mt-1">{note}</div>}
    </div>
  );
}

function Bar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span className="w-16 shrink-0">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-gray-200">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

export default function TrackRecordPage() {
  const [report, setReport] = useState<TrackReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/track-record")
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error);
        setReport(data);
      })
      .catch((e) => setError(e.message || "Failed to load the track record"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-dvh bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-900/70">
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-4">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Track record
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Every prediction is saved before kickoff and never edited. After the
            match, it is scored against the real numbers.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-8">
        {loading && (
          <div className="grid grid-cols-2 gap-3 animate-pulse">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-gray-900" />
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {report && report.stored === 0 && (
          <p className="text-center text-gray-500 py-16">
            No predictions saved yet. Open the matches page once and the site
            starts saving predictions before kickoff.
          </p>
        )}

        {report && report.stored > 0 && (
          <>
            {report.settled < 30 && (
              <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 text-sm text-amber-200">
                {report.settled === 0
                  ? `${report.pending} predictions are saved and waiting for results.`
                  : `Only ${report.settled} matches are scored so far. Scores from a small sample swing a lot, so read them as a preview.`}
              </div>
            )}

            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric
                label="Matches scored"
                value={String(report.settled)}
                note={`${report.pending} waiting`}
              />
              <Metric
                label="Brier score"
                value={dec(report.brier)}
                note="Lower is better"
              />
              <Metric
                label="Hit rate"
                value={pct(report.hitRate)}
                note={`${report.calls} over/under calls`}
              />
              <Metric
                label="Strong calls"
                value={pct(report.strong.hitRate)}
                note={`${report.strong.calls} calls at 65%+`}
              />
            </section>

            <section className="rounded-xl bg-gray-900 border border-gray-800 p-4 text-sm text-gray-400 space-y-2">
              <p>
                <span className="text-gray-200">Brier score</span> is the
                average squared gap between the predicted chance and what
                happened. Always guessing 50% scores 0.25, so anything below
                that beats a coin flip.
              </p>
              <p>
                <span className="text-gray-200">Hit rate</span> is the share of
                over/under calls on the right side. A strong call is a line
                where the model gave 65% or more to one side.
              </p>
              <p>
                <span className="text-gray-200">Average miss</span> is the mean
                gap between the expected total and the real total.
              </p>
            </section>

            {report.stats.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
                  Accuracy by statistic
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {report.stats.map((s) => (
                    <div
                      key={s.key}
                      className="rounded-xl bg-gray-900 border border-gray-800 p-4"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-semibold">{s.label}</h3>
                        <span className="text-xs text-gray-500">
                          {s.matches} matches
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                        <div>
                          <div className="font-mono text-lg">{pct(s.hitRate)}</div>
                          <div className="text-[11px] text-gray-500">Hit rate</div>
                        </div>
                        <div>
                          <div className="font-mono text-lg">{dec(s.brier)}</div>
                          <div className="text-[11px] text-gray-500">Brier</div>
                        </div>
                        <div>
                          <div className="font-mono text-lg">{dec(s.mae, 2)}</div>
                          <div className="text-[11px] text-gray-500">Avg miss</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {report.calibration.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Do the percentages hold up?
                </h2>
                <p className="text-sm text-gray-500 mb-3">
                  When the model said 70%, the outcome should happen about 70%
                  of the time. Matching bars mean the percentages are honest.
                </p>
                <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-4">
                  {report.calibration.map((b) => (
                    <div key={b.from}>
                      <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                        <span>
                          {Math.round(b.from * 100)}–{Math.round(b.to * 100)}% predicted
                        </span>
                        <span>{b.calls} calls</span>
                      </div>
                      <div className="space-y-1">
                        <Bar label="Said" value={b.predicted} color="bg-blue-500" />
                        <Bar label="Happened" value={b.actual} color="bg-emerald-500" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {report.recent.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
                  Recent matches
                </h2>
                <div className="grid gap-3">
                  {report.recent.map((m) => (
                    <div
                      key={m.fixtureId}
                      className="rounded-xl bg-gray-900 border border-gray-800 p-4"
                    >
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{m.league}</span>
                        <span>{format(new Date(m.kickoff), "d MMM yyyy")}</span>
                      </div>
                      <div className="font-medium mt-1">
                        {m.home}{" "}
                        <span className="font-mono text-gray-300">
                          {m.homeGoals ?? "–"}–{m.awayGoals ?? "–"}
                        </span>{" "}
                        {m.away}
                      </div>
                      <div className="mt-3 divide-y divide-gray-800 text-sm">
                        {m.rows.map((r) => (
                          <div
                            key={r.label}
                            className="flex items-center justify-between py-1.5"
                          >
                            <span className="text-gray-400">{r.label}</span>
                            <span className="font-mono">
                              <span className="text-gray-500">
                                {r.expected.toFixed(1)} expected
                              </span>{" "}
                              <span className="text-white">{r.actual} actual</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {report.firstRecorded && (
              <p className="text-xs text-gray-500 text-center">
                Saving predictions since{" "}
                {format(new Date(report.firstRecorded), "d MMMM yyyy")}.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}