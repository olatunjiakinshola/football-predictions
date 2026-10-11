import { NextResponse } from "next/server";
import { loadHistory, loadUpcoming } from "@/lib/football-data";
import { buildPrediction } from "@/lib/match-prediction";
import { recordFixtures } from "@/lib/track-record";
import type { Predictions, StatPrediction } from "@/lib/predictions";
import type { Fixture } from "@/lib/api-football";

function pick(p: StatPrediction | undefined, line: string) {
  if (!p || p.total === null) return null;

  return {
    expected: p.total,
    line,
    over: p.overProb[line] ?? null,
    confidence: p.confidence,
  };
}

export async function GET() {
  try {
    const fixtures = await loadUpcoming(7);

    // If the history download fails, the list still loads without previews.
    const history = await loadHistory().catch(() => null);

    const toRecord: { fixture: Fixture; predictions: Predictions }[] = [];

    const data = fixtures.map((f) => {
      if (!history) return { ...f, headline: null, gamesUsed: 0 };

      const { predictions, homeGamesUsed, awayGamesUsed } = buildPrediction(
        f,
        history
      );

      toRecord.push({ fixture: f, predictions });

      return {
        ...f,
        headline: {
          goals: pick(predictions.goals, "2.5"),
          corners: pick(predictions.corners, "9.5"),
          cards: pick(predictions.yellowCards, "3.5"),
          shotsOnTarget: pick(predictions.shotsOnTarget, "8.5"),
        },
        gamesUsed: Math.min(homeGamesUsed, awayGamesUsed),
      };
    });

    // Saving must never break the homepage.
    await recordFixtures(toRecord).catch((e) =>
      console.error("Could not save predictions", e)
    );

    return NextResponse.json(data);
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch fixtures" },
      { status: 500 }
    );
  }
}