import type { Fixture } from "./api-football";
import { lastGamesForTeam } from "./football-data";
import {
  pickVenueAverages,
  predictMatch,
  type AveragesInput,
} from "./predictions";

const WINDOW = 20; // about 10 home and 10 away games per team

export function buildPrediction(fixture: Fixture, history: AveragesInput[]) {
  const homeId = fixture.teams.home.id;
  const awayId = fixture.teams.away.id;

  const homeGames = lastGamesForTeam(history, homeId, WINDOW);
  const awayGames = lastGamesForTeam(history, awayId, WINDOW);

  const home = pickVenueAverages(homeGames, homeId, "home");
  const away = pickVenueAverages(awayGames, awayId, "away");

  return {
    homeAvg: home.averages,
    awayAvg: away.averages,
    predictions: predictMatch(home.averages, away.averages),
    homeGamesUsed: home.averages.games,
    awayGamesUsed: away.averages.games,
    homeVenueUsed: home.venueUsed,
    awayVenueUsed: away.venueUsed,
  };
}