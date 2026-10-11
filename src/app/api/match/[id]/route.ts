import { NextRequest, NextResponse } from "next/server";
import { loadHistory, loadUpcoming } from "@/lib/football-data";
import { buildPrediction } from "@/lib/match-prediction";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const fixtureId = Number(id);

    if (!Number.isFinite(fixtureId)) {
      return NextResponse.json({ error: "Invalid fixture id" }, { status: 400 });
    }

    const upcoming = await loadUpcoming(14);
    const fixture = upcoming.find((f) => f.fixture.id === fixtureId);

    if (!fixture) {
      return NextResponse.json(
        { error: "Fixture not found. It has finished or left the fixture list." },
        { status: 404 }
      );
    }

    const history = await loadHistory();

    return NextResponse.json({
      fixture,
      ...buildPrediction(fixture, history),
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error.message || "Failed to generate predictions" },
      { status: 500 }
    );
  }
}