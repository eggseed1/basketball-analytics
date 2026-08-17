/**
 * Sample highest-possession DRBL players per team for 2025-26 route QA.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import drbl from "../src/data/drbl/precomputed/2025-26.json";
import { hasValidatedDrblEstimate } from "../drbl/models/validated-percentile-eligibility-v1";
import { loadPlayerIdAliases, isProductionApprovedPlayerAlias } from "../src/data/providers/impact/player-id-aliases";

async function main() {
  const aliases = await loadPlayerIdAliases();
  const players = (drbl as { players: Array<Record<string, unknown>> }).players;
  const byTeam = new Map<
    string,
    {
      team: string;
      nbaId: string;
      espnId: string;
      name: string;
      drbl100: number;
      possessions: number;
      rank: string;
    }
  >();

  for (const r of players) {
    const ok = hasValidatedDrblEstimate({
      validatedDRBL100: Number(r.drbl100),
      validatedRawP100: Number(r.rawAbilityRate),
      validatedActualPossessions: Number(
        r.actualPossessions ?? r.possessions ?? 0
      ),
    });
    if (!ok) continue;
    const team = String(r.teamId || "UNK");
    const possessions = Number(r.actualPossessions ?? r.possessions ?? 0);
    const prev = byTeam.get(team);
    if (prev && possessions <= prev.possessions) continue;
    const nbaId = String(r.playerId);
    const alias = aliases.byNba.get(nbaId);
    const espnId =
      alias && isProductionApprovedPlayerAlias(alias)
        ? alias.espnPlayerId
        : "";
    byTeam.set(team, {
      team,
      nbaId,
      espnId,
      name: String(r.playerName ?? ""),
      drbl100: Number(r.drbl100),
      possessions,
      rank: r.rank != null ? String(r.rank) : "",
    });
  }

  const rows = [...byTeam.values()].sort((a, b) =>
    a.team.localeCompare(b.team)
  );
  const lines = [
    "teamId,playerName,nbaPlayerId,espnPlayerId,drbl100,actualPossessions,drblRank,sampleRoute,joinStatus",
  ];
  for (const r of rows) {
    const id = r.espnId || r.nbaId;
    const join = r.espnId ? "approved_alias" : "nba_id_only";
    lines.push(
      [
        r.team,
        JSON.stringify(r.name),
        r.nbaId,
        r.espnId,
        r.drbl100.toFixed(2),
        r.possessions,
        r.rank,
        `/players/${id}?season=2025-26`,
        join,
      ].join(",")
    );
  }
  const out = path.join(
    process.cwd(),
    "reports",
    "product_completeness_v1_1",
    "06_live_player_route_qa.csv"
  );
  writeFileSync(out, lines.join("\n") + "\n", "utf8");
  console.log(`wrote ${rows.length} team samples → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
