import { NextResponse } from "next/server";
import { loadHistory } from "@/lib/football-data";
import { readPredictions } from "@/lib/prediction-store";
import { buildReport, settleFinished } from "@/lib/track-record";

export async function GET() {
  try {
    const history = await loadHistory().catch(() => null);
    if (history) await settleFinished(history);

    const all = await readPredictions();
    return NextResponse.json(buildReport(all));
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Failed to build the track record" },
      { status: 500 }
    );
  }
}