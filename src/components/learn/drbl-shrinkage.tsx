import {
  DrblShrinkageExplorer,
  type ShrinkageModel,
  type ShrinkagePlayer,
} from "@/components/learn/drbl-shrinkage-explorer";
import { drblPublishedGames, listDrblSeasons } from "@/data/drbl/season-registry";
import { fetchDrblSeason } from "@/data/providers/nba/drbl-loader";

import { BOX_FORWARD_CONFIG, calibrationAt } from "../../../drbl/models/box-forward";
import boxForwardWeights from "../../../drbl/models/box-forward-weights.json";
import { BOX_PRIOR_CONFIG } from "../../../drbl/models/box-prior";

const MIN_POSSESSIONS = 100;

/** Loads the latest DRBL season for the small-sample explorer on the DRBL/100 guide. */
export async function DrblShrinkage() {
  const season = [...listDrblSeasons()].sort().at(-1);
  if (!season) return null;
  const rows = await fetchDrblSeason(season).catch(() => []);
  const games = drblPublishedGames(season);
  if (games == null) return null;
  const model: ShrinkageModel = {
    playerShrinkK: boxForwardWeights.playerShrinkK,
    pbpHandoff: BOX_PRIOR_CONFIG.shrinkK,
    v1Share: BOX_FORWARD_CONFIG.v1Share,
    calibration: calibrationAt(boxForwardWeights.calibration, games),
  };
  const players: ShrinkagePlayer[] = rows
    .filter((r) => r.possessions >= MIN_POSSESSIONS && Number.isFinite(r.drbl100))
    .map((r) => {
      const n = Math.round(r.possessions);
      const trust = n / (n + model.playerShrinkK);
      return [String(r.playerId), r.playerName, n, Math.round((r.drbl100 / trust) * 100) / 100, r.drbl100];
    });
  if (players.length < 20) return null;
  return (
    <DrblShrinkageExplorer season={season} players={players} model={model} minPossessions={MIN_POSSESSIONS} />
  );
}
