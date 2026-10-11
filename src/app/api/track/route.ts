import { NextResponse } from "next/server";
import { loadHistory, loadUpcoming } from "@/lib/football-data";
import { buildPrediction } from "@/lib/match-prediction";
import { recordFixtures, settleFinished } from "@/lib/track-record";

export async function GET(request: Request) {
  // Vercel sends this header on scheduled runs when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [fixtures, history] = await Promise.all([
      loadUpcoming(14),
      loadHistory(),
    ]);

    const recorded = await recordFixtures(
      fixtures.map((f) => ({
        fixture: f,
        predictions: buildPrediction(f, history).predictions,
      }))
    );

    const settled = await settleFinished(history);

    return NextResponse.json({ recorded, settled });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Tracking failed" },
      { status: 500 }
    );
  }
}