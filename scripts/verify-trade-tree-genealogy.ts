/**
 * Site-wide trade tree genealogy verifier.
 * Run: npx tsx scripts/verify-trade-tree-genealogy.ts
 */
import Module from "node:module";

import { buildTransactionEventIndex } from "../src/data/providers/transactions/transaction-event-index";
import { ESPN_TEAM_META } from "../src/data/providers/nba/team-meta";
import {
  assetOutboundInEvent,
  descriptionMentionsAsset,
  parseTradeSides,
  type ParsedTradeAsset,
} from "../src/lib/trade-tree-parse";
import { resolveTeamBrand } from "../src/lib/nba-brand";
import { normalizePlayerName } from "../src/lib/player-name";
import type {
  TradeTreeDisposition,
  TradeTreeNode,
} from "../src/data/types/team-trade-tree";
import type { NbaTransactionEvent } from "../src/data/types/transaction-event";

const origLoad = (Module as unknown as { _load: Function })._load;
(Module as unknown as { _load: Function })._load = function (
  req: string,
  parent: unknown,
  isMain: boolean
) {
  if (req === "server-only") return {};
  // eslint-disable-next-line prefer-rest-params
  return origLoad.apply(this, arguments);
};

type Violation = {
  teamId: string;
  teamAbbr: string;
  player: string;
  rootDate: string;
  fromAsset: string;
  dispositionDate: string;
  toTeam: string | null;
  eventId: string;
  reason: string;
  description: string;
};

function eventMentionsTeam(description: string, teamId: string): boolean {
  const lower = description.toLowerCase();
  const brand = resolveTeamBrand(teamId);
  const meta = ESPN_TEAM_META[teamId];
  const needles = new Set<string>();
  if (brand?.abbr) needles.add(brand.abbr.toLowerCase());
  if (meta?.city) needles.add(meta.city.toLowerCase());
  const cityNicks: Record<string, string[]> = {
    atlanta: ["hawks"],
    boston: ["celtics"],
    brooklyn: ["nets"],
    "new orleans": ["pelicans", "hornets"],
    chicago: ["bulls"],
    cleveland: ["cavaliers", "cavs"],
    dallas: ["mavericks", "mavs"],
    denver: ["nuggets"],
    detroit: ["pistons"],
    "golden state": ["warriors"],
    houston: ["rockets"],
    indiana: ["pacers"],
    "la clippers": ["clippers"],
    "los angeles": ["lakers"],
    miami: ["heat"],
    milwaukee: ["bucks"],
    minnesota: ["timberwolves", "wolves"],
    "new york": ["knicks"],
    orlando: ["magic"],
    philadelphia: ["sixers", "76ers"],
    phoenix: ["suns"],
    portland: ["blazers", "trail blazers"],
    sacramento: ["kings"],
    "san antonio": ["spurs"],
    "oklahoma city": ["thunder", "sonics"],
    utah: ["jazz"],
    washington: ["wizards", "bullets"],
    toronto: ["raptors"],
    memphis: ["grizzlies"],
    charlotte: ["hornets", "bobcats"],
  };
  for (const nick of cityNicks[meta?.city.toLowerCase() ?? ""] ?? []) {
    needles.add(nick);
  }
  return [...needles].some((n) => n.length >= 3 && lower.includes(n));
}

function validateTradedDisposition(options: {
  focusTeamId: string;
  assetLabel: string;
  assetMatchKey: string;
  assetKind: "player" | "pick" | "cash" | "other";
  disposition: TradeTreeDisposition;
  byId: Map<string, NbaTransactionEvent>;
}): string | null {
  const { focusTeamId, assetLabel, assetMatchKey, assetKind, disposition, byId } =
    options;
  if (disposition.kind !== "traded") return null;
  const event = byId.get(disposition.eventId);
  if (!event) return `event ${disposition.eventId} not found`;

  const parsedAsset: ParsedTradeAsset = {
    kind: assetKind === "pick" ? "pick" : assetKind === "player" ? "player" : "other",
    label: assetLabel,
    matchKey: assetMatchKey,
  };

  const mentionsFocus =
    event.teamId === focusTeamId || eventMentionsTeam(event.description, focusTeamId);
  if (!mentionsFocus) {
    return `focus team not mentioned in event`;
  }

  if (event.teamId === focusTeamId) {
    if (!assetOutboundInEvent(event.description, parsedAsset)) {
      return `focus-team event does not outbound asset`;
    }
    return null;
  }

  const sides = parseTradeSides(event.description);
  const partnerGot = sides.got.some(
    (g) =>
      g.matchKey === assetMatchKey ||
      descriptionMentionsAsset(g.label, parsedAsset) ||
      descriptionMentionsAsset(assetLabel, g)
  );
  if (!partnerGot) {
    return `partner event acquired asset but parse did not confirm outbound from focus`;
  }

  const expectedTo = resolveTeamBrand(event.teamId)?.abbr ?? event.teamId;
  if (disposition.toTeamAbbr && disposition.toTeamAbbr !== expectedTo) {
    return `disposition to ${disposition.toTeamAbbr} but event posted by ${expectedTo}`;
  }

  return null;
}

function collectTraded(
  node: TradeTreeNode,
  focusTeamId: string,
  out: Array<{
    fromAssetLabel: string;
    assetMatchKey: string;
    assetKind: "player" | "pick" | "cash" | "other";
    disposition: TradeTreeDisposition;
  }>
) {
  const assetsById = new Map(node.assets.map((a) => [a.id, a]));
  for (const child of node.children) {
    if (child.disposition.kind === "traded") {
      const asset = assetsById.get(child.fromAssetId);
      out.push({
        fromAssetLabel: child.fromAssetLabel,
        assetMatchKey: asset?.matchKey ?? normalizePlayerName(child.fromAssetLabel),
        assetKind: asset?.kind ?? "player",
        disposition: child.disposition,
      });
    }
    if (child.node) collectTraded(child.node, focusTeamId, out);
  }
}

async function main() {
  const { buildTeamTradeTree } = await import(
    "../src/data/queries/team-trade-tree"
  );
  const index = await buildTransactionEventIndex();
  const byId = index.byId;

  const teamIds = Object.keys(ESPN_TEAM_META).sort(
    (a, b) => Number(a) - Number(b)
  );
  const violations: Violation[] = [];
  let treesBuilt = 0;
  let dispositionsChecked = 0;

  const spotChecks: Array<{
    teamId: string;
    player: string;
    asset: string;
    expectTo?: string;
    expectAbsentTo?: string;
  }> = [
    { teamId: "2", player: "Kevin Garnett", asset: "Kevin Garnett", expectTo: "BKN" },
    { teamId: "17", player: "Kevin Garnett", asset: "Kevin Garnett", expectTo: "MIN" },
    {
      teamId: "17",
      player: "Thaddeus Young",
      asset: "Thaddeus Young",
      expectAbsentTo: "CHI",
    },
    {
      teamId: "2",
      player: "Al Horford",
      asset: "Al Horford",
      expectAbsentTo: "PHI",
    },
    {
      teamId: "25",
      player: "Al Horford",
      asset: "Al Horford",
      expectTo: "BOS",
    },
  ];

  for (const teamId of teamIds) {
    const catalogTree = await buildTeamTradeTree({ teamId });
    if (!catalogTree?.playerCatalog.length) continue;

    const players = catalogTree.playerCatalog.slice(0, 60);
    for (const hit of players) {
      const tree = await buildTeamTradeTree({
        teamId,
        focusPlayer: hit.label,
      });
      if (!tree?.rootEventId) continue;
      treesBuilt += 1;

      const traded: Array<{
        fromAssetLabel: string;
        assetMatchKey: string;
        assetKind: "player" | "pick" | "cash" | "other";
        disposition: TradeTreeDisposition;
      }> = [];
      collectTraded(tree.root, teamId, traded);
      for (const node of tree.ancestry) {
        collectTraded(node, teamId, traded);
      }

      for (const row of traded) {
        dispositionsChecked += 1;
        const reason = validateTradedDisposition({
          focusTeamId: teamId,
          assetLabel: row.fromAssetLabel,
          assetMatchKey: row.assetMatchKey,
          assetKind: row.assetKind,
          disposition: row.disposition,
          byId,
        });
        if (reason) {
          const event = byId.get(
            row.disposition.kind === "traded" ? row.disposition.eventId : ""
          );
          violations.push({
            teamId,
            teamAbbr: tree.teamAbbr,
            player: hit.label,
            rootDate: tree.rootDate,
            fromAsset: row.fromAssetLabel,
            dispositionDate:
              row.disposition.kind === "traded" ? row.disposition.date : "",
            toTeam:
              row.disposition.kind === "traded"
                ? row.disposition.toTeamAbbr
                : null,
            eventId:
              row.disposition.kind === "traded" ? row.disposition.eventId : "",
            reason,
            description: event?.description ?? "",
          });
        }
      }
    }
  }

  console.log(
    `Scanned ${treesBuilt} trees across ${teamIds.length} teams; checked ${dispositionsChecked} traded dispositions.`
  );

  if (violations.length) {
    console.error(`\n${violations.length} genealogy violation(s):\n`);
    for (const v of violations.slice(0, 25)) {
      console.error(
        `- ${v.teamAbbr} / ${v.player} (${v.rootDate}): ${v.fromAsset} → ${v.toTeam} on ${v.dispositionDate}\n  ${v.reason}\n  ${v.description.slice(0, 140)}…`
      );
    }
    if (violations.length > 25) {
      console.error(`… and ${violations.length - 25} more`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("No genealogy violations found in catalog sweep.");

  for (const check of spotChecks) {
    const tree = await buildTeamTradeTree({
      teamId: check.teamId,
      focusPlayer: check.player,
    });
    const traded: Array<{
      fromAssetLabel: string;
      disposition: TradeTreeDisposition;
    }> = [];
    if (tree?.root) collectTraded(tree.root, check.teamId, traded as never);
    const row = traded.find((t) => t.fromAssetLabel === check.asset);
    if (check.expectTo) {
      if (!row) {
        console.error(
          `Spot check missing: ${check.teamId} ${check.player} → ${check.expectTo}`
        );
        process.exitCode = 1;
        continue;
      }
      if (
        row.disposition.kind === "traded" &&
        row.disposition.toTeamAbbr !== check.expectTo
      ) {
        console.error(
          `Spot check failed: ${check.player} on team ${check.teamId} expected ${check.expectTo}, got ${row.disposition.toTeamAbbr}`
        );
        process.exitCode = 1;
      }
    }
    if (check.expectAbsentTo) {
      const bad = traded.find(
        (t) =>
          t.fromAssetLabel === check.asset &&
          t.disposition.kind === "traded" &&
          t.disposition.toTeamAbbr === check.expectAbsentTo
      );
      if (bad) {
        console.error(
          `Spot check false positive: ${check.player} on team ${check.teamId} must not trace to ${check.expectAbsentTo}`
        );
        process.exitCode = 1;
      }
    }
  }

  if (!process.exitCode) {
    console.log("Spot checks passed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
