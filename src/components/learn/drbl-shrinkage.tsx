import { DrblShrinkageExplorer, type ShrinkagePlayer } from "@/components/learn/drbl-shrinkage-explorer";
import { listDrblSeasons } from "@/data/drbl/season-registry";
import { fetchDrblSeason } from "@/data/providers/nba/drbl-loader";

const MIN_POSSESSIONS = 100;

/** Loads the latest DRBL season for the shrinkage explorer on the DRBL/100 guide. */
export async function DrblShrinkage() {
  const season = [...listDrblSeasons()].sort().at(-1);
  if (!season) return null;
  const rows = await fetchDrblSeason(season).catch(() => []);
  const players: ShrinkagePlayer[] = rows
    .filter(
      (r) =>
        r.possessions >= MIN_POSSESSIONS &&
        Number.isFinite(r.rawAbilityRate) &&
        Number.isFinite(r.drbl100)
    )
    .map((r) => [
      String(r.playerId),
      r.playerName,
      Math.round(r.possessions),
      Math.round(r.rawAbilityRate * 100) / 100,
      r.drbl100,
    ]);
  if (players.length < 20) return null;
  return <DrblShrinkageExplorer season={season} players={players} minPossessions={MIN_POSSESSIONS} />;
}
