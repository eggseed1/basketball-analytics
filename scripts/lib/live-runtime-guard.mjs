/** Prevent code-only merges and deployments from rolling back real NBA results. */
export const LIVE_BOARD_FILES = [
  "src/data/runtime/standings-snapshot.json",
  "src/data/runtime/game-snapshot.json",
  "src/data/runtime/team-game-box-snapshot.json",
];

const timestamp = (value) => {
  const parsed = Date.parse(value?.generatedAt ?? "");
  return Number.isFinite(parsed) ? parsed : -1;
};
const latestSeason = (value) => {
  const seasons = Array.isArray(value?.seasons) ? value.seasons : Object.keys(value?.seasons ?? value?.teams ?? {});
  return seasons.filter(x => /^20\d\d-\d\d$/.test(x)).sort().at(-1) ?? null;
};
const standingRows = (data, season) =>
  (data?.seasons?.[season]?.conferences ?? []).flatMap(group => group.rows ?? []);
const finals = (data, season) => (data?.games ?? []).filter(game =>
  game.season === season && game.status === "final" && game.gameType === "regular"
).length;

/**
 * A source snapshot from the last nightly ingestion is the minimum trusted
 * state. A newer snapshot with >= finals may be retained (home runner, rerun).
 */
export function snapshotRegressed(file, current, nightly) {
  if (timestamp(nightly) < 0) throw new Error(`Nightly ${file} has no valid generatedAt`);
  if (timestamp(current) < timestamp(nightly)) return true;
  const season = latestSeason(nightly);
  if (!season) throw new Error(`Nightly ${file} has no current season`);
  if (file.endsWith("/standings-snapshot.json")) {
    const rows = standingRows(nightly, season);
    if (rows.length !== 30) throw new Error(`Nightly standings for ${season} have ${rows.length} teams, expected 30`);
    const nowRows = new Map(standingRows(current, season).map(row => [row.teamId, row]));
    return rows.some(row => {
      const now = nowRows.get(row.teamId);
      return !now || (Number(now.wins) + Number(now.losses)) < (Number(row.wins) + Number(row.losses));
    });
  }
  if (file.endsWith("/game-snapshot.json")) {
    const sourceFinals = finals(nightly, season);
    return finals(current, season) < sourceFinals;
  }
  if (file.endsWith("/team-game-box-snapshot.json")) {
    const sources = Object.entries(nightly.teams?.[season] ?? {});
    if (!sources.length) throw new Error(`Nightly team boxes for ${season} have no teams`);
    const actual = current?.teams?.[season] ?? {};
    return sources.some(([team, rows]) => {
      const got = actual[team] ?? [];
      if (got.length < rows.length) return true;
      const lastDate = rows.at(-1)?.[0] ?? "";
      return lastDate > (got.at(-1)?.[0] ?? "");
    });
  }
  throw new Error(`Unrecognized live board: ${file}`);
}
