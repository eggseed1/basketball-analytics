/**
 * Link movement stories to the ESPN transaction ledger.
 *
 * - Trades in the current window become completed clusters on their own.
 * - A reported story resolves as "materialized" when a matching ledger row
 *   (same player, same kind of move) lands on or after the first report.
 * - Stories with no new reports for EXPIRE_DAYS expire.
 *
 * Pure: callers pass ledger rows and a text entity resolver.
 */

import {
  CITY_TEAM_IDS,
  ledgerSentences,
  NON_PLAYER_ASSET,
  parseTradeText,
  teamIdForName,
} from "@/lib/espn-ledger-text";
import type { MovementFamily } from "@/movement-center/classify-headline";
import {
  ESPN_TRANSACTIONS_SOURCE_ID,
  ESPN_TRANSACTIONS_TIER,
  type MovementSourceTier,
} from "@/movement-center/reporters";
import type {
  MovementClaim,
  MovementDeal,
  MovementDealAsset,
  MovementDealUnconfirmed,
  MovementResolution,
  MovementStoryCluster,
} from "@/movement-center/types";

export type LedgerRow = {
  id: string;
  date: string;
  description?: string;
  teamIds: string[];
};

export type LedgerContext = {
  resolveText: (text: string) => { playerIds: string[]; teamIds: string[] };
  playerName: (playerId: string) => string | undefined;
  teamName: (teamId: string) => string | undefined;
};

export const EXPIRE_DAYS = 60;
const MATCH_LEAD_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

const LEDGER_URL = "/offseason";

function counterpartyTeams(text: string): string[] {
  return CITY_TEAM_IDS.filter(([pattern]) => pattern.test(text)).map(([, id]) => id);
}

const TRADE_SENTENCE = /\bacquired\b|\btraded\b|\breceived\b|\bsent\b/i;
const CONTRACT_SENTENCE = /\b(signed|re-signed|extension|agreed to terms|contract)\b/i;
const NOT_A_SIGNING = /\b(waived|waivers|released|renounced|declined)\b/i;

type ReceivedAsset = { teamId: string; label: string; fromTeamId?: string };

function teamIdFor(name: string, ctx: LedgerContext): string | undefined {
  const known = teamIdForName(name);
  if (known) return known;
  const byNickname = ctx.resolveText(name).teamIds;
  return byNickname.length === 1 ? byNickname[0] : undefined;
}

/** Who received what in one ledger row (see `parseTradeText`). */
export function parseTradeRow(row: LedgerRow, ctx: LedgerContext): ReceivedAsset[] {
  return parseTradeText(row.description, row.teamIds[0], (name) => teamIdFor(name, ctx)).filter(
    (r): r is ReceivedAsset => r.teamId !== null
  );
}

function assetKey(asset: MovementDealAsset): string {
  if (asset.playerId) return `p:${asset.playerId}`;
  return `${asset.fromTeamId ?? ""}|${asset.label.toLowerCase().replace(/s$/, "")}`;
}

function buildDeal(deal: TradeDeal, ctx: LedgerContext): MovementDeal {
  const sides = new Map<string, Map<string, MovementDealAsset>>();
  const sideFor = (teamId: string) => {
    if (!sides.has(teamId)) sides.set(teamId, new Map());
    return sides.get(teamId)!;
  };
  for (const { row } of deal.rows) {
    if (row.teamIds[0]) sideFor(row.teamIds[0]);
  }
  for (const teamId of deal.teamIds) sideFor(teamId);

  const parsed = deal.rows.map(({ row }) => ({
    rowTeamId: row.teamIds[0],
    received: parseTradeRow(row, ctx).map((r) => {
      const playerId = ctx.resolveText(r.label).playerIds[0];
      return { ...r, playerId, key: playerId ? `p:${playerId}` : r.label.toLowerCase().replace(/s$/, "") };
    }),
  }));
  // What each team's own entry says it took in. An item another entry says it
  // sent that team only counts when that team has no entry here or lists it too.
  const ownReceipts = new Map<string, Set<string>>();
  for (const { rowTeamId, received } of parsed) {
    if (!rowTeamId) continue;
    const keys = ownReceipts.get(rowTeamId) ?? new Set<string>();
    for (const r of received) if (r.teamId === rowTeamId) keys.add(r.key);
    ownReceipts.set(rowTeamId, keys);
  }
  const unconfirmed: MovementDealUnconfirmed[] = [];

  for (const { rowTeamId, received: rows } of parsed) {
    for (const received of rows) {
      const playerId = received.playerId;
      const label = (playerId && ctx.playerName(playerId)) || received.label;
      const nonPlayer = !playerId && NON_PLAYER_ASSET.test(received.label);
      const receiverEntry = ownReceipts.get(received.teamId);
      if (rowTeamId && received.teamId !== rowTeamId && receiverEntry && !receiverEntry.has(received.key)) {
        unconfirmed.push({
          label,
          ...(playerId ? { playerId } : {}),
          ...(nonPlayer ? { nonPlayer: true as const } : {}),
          claimedByTeamId: rowTeamId,
          toTeamId: received.teamId,
        });
        continue;
      }
      const asset: MovementDealAsset = {
        label,
        ...(playerId ? { playerId } : {}),
        ...(nonPlayer ? { nonPlayer: true as const } : {}),
        ...(received.fromTeamId && received.fromTeamId !== received.teamId
          ? { fromTeamId: received.fromTeamId }
          : {}),
      };
      const side = sideFor(received.teamId);
      if (asset.fromTeamId) sideFor(asset.fromTeamId);
      const key = assetKey(asset);
      const existing = side.get(key);
      if (!existing) side.set(key, asset);
      else if (!existing.fromTeamId && asset.fromTeamId) existing.fromTeamId = asset.fromTeamId;
    }
  }

  const all = [...sides.entries()].map(([teamId, assets]) => ({
    teamId,
    teamName: ctx.teamName(teamId),
    receives: [...assets.values()].sort((a, b) => Number(!!a.nonPlayer) - Number(!!b.nonPlayer)),
  }));
  return {
    date: deal.date,
    sides: [...all.filter((s) => s.receives.length), ...all.filter((s) => !s.receives.length)],
    ...(unconfirmed.length ? { unconfirmed } : {}),
  };
}

function ledgerTime(date: string): string {
  return `${date}T12:00:00.000Z`;
}

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS;
}

type TradeDeal = {
  rows: { row: LedgerRow; text: string; playerIds: string[] }[];
  date: string;
  playerIds: string[];
  teamIds: string[];
};

function groupTradeDeals(rows: LedgerRow[], ctx: LedgerContext): TradeDeal[] {
  const deals: TradeDeal[] = [];
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  for (const row of ordered) {
    const sentences = ledgerSentences(row.description).filter((s) => TRADE_SENTENCE.test(s));
    if (!sentences.length) continue;
    const text = sentences.join(" ");
    const playerIds = ctx.resolveText(text).playerIds;
    const teamIds = [...new Set([...row.teamIds, ...counterpartyTeams(text)])];
    const samePair = (deal: TradeDeal) =>
      teamIds.length >= 2 &&
      teamIds.length === deal.teamIds.length &&
      teamIds.every((id) => deal.teamIds.includes(id));
    const home = deals.find(
      (deal) =>
        Math.abs(daysBetween(ledgerTime(deal.date), ledgerTime(row.date))) <= 1 &&
        (playerIds.some((id) => deal.playerIds.includes(id)) || samePair(deal))
    );
    const entry = { row, text, playerIds };
    if (home) {
      home.rows.push(entry);
      home.playerIds = [...new Set([...home.playerIds, ...playerIds])];
      home.teamIds = [...new Set([...home.teamIds, ...teamIds])];
    } else {
      deals.push({ rows: [entry], date: row.date, playerIds, teamIds });
    }
  }
  return mergeLinkedDeals(deals, ctx);
}

/**
 * Multi-team trades arrive as one ledger row per acquiring team. Two deals
 * on the same day are one trade only when they mirror each other: one
 * records team Y receiving from X and the other records X receiving from Y.
 * A team sharing a day across unrelated trades is not enough.
 */
function mergeLinkedDeals(deals: TradeDeal[], ctx: LedgerContext): TradeDeal[] {
  const edges = (deal: TradeDeal) => {
    const out = new Set<string>();
    for (const { row } of deal.rows) {
      for (const asset of parseTradeRow(row, ctx)) {
        if (asset.fromTeamId) out.add(`${asset.fromTeamId}>${asset.teamId}`);
      }
    }
    return out;
  };
  const linked = (a: TradeDeal, b: TradeDeal) => {
    if (Math.abs(daysBetween(ledgerTime(a.date), ledgerTime(b.date))) > 1) return false;
    const eb = edges(b);
    return [...edges(a)].some((edge) => {
      const [from, to] = edge.split(">");
      return eb.has(`${to}>${from}`);
    });
  };

  const out = [...deals];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        if (!linked(out[i]!, out[j]!)) continue;
        const a = out[i]!;
        const b = out[j]!;
        out[i] = {
          rows: [...a.rows, ...b.rows],
          date: a.date < b.date ? a.date : b.date,
          playerIds: [...new Set([...a.playerIds, ...b.playerIds])],
          teamIds: [...new Set([...a.teamIds, ...b.teamIds])],
        };
        out.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return out;
}

function ledgerClaim(
  clusterId: string,
  row: LedgerRow,
  text: string,
  playerIds: string[],
  claimType: MovementClaim["claimType"]
): MovementClaim {
  return {
    id: `mv-${row.id}`,
    clusterId,
    summary: text,
    claimType,
    evidenceClass: "reported",
    state: "completed",
    provenanceKind: "completed_transaction",
    publishedAt: ledgerTime(row.date),
    sourceId: ESPN_TRANSACTIONS_SOURCE_ID,
    sourceLabel: ESPN_TRANSACTIONS_TIER.label,
    sourceUrl: LEDGER_URL,
    playerIds,
    teamIds: row.teamIds,
    isOriginal: true,
  };
}

function listNames(ids: string[], ctx: LedgerContext): string {
  const names = ids.map((id) => ctx.playerName(id)).filter((n): n is string => Boolean(n));
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

function dealHeadline(deal: TradeDeal, ctx: LedgerContext): string {
  const teams = deal.teamIds
    .map((id) => ctx.teamName(id))
    .filter((n): n is string => Boolean(n));
  const players = listNames(deal.playerIds, ctx);
  const lead = teams.length ? `${teams.join("–")} trade` : "Trade";
  return players ? `${lead}: ${players}` : lead;
}

export type LedgerLinkInput = {
  newsClusters: MovementStoryCluster[];
  newsClaims: MovementClaim[];
  families: Map<string, MovementFamily>;
  ledger: LedgerRow[];
  /** Trades on or after this date become standalone completed clusters. */
  tradeWindowStart: string;
  now: Date;
};

export type LedgerLinkResult = {
  clusters: MovementStoryCluster[];
  claims: MovementClaim[];
  resolutions: MovementResolution[];
  sources: Record<string, MovementSourceTier>;
  materialized: number;
  expired: number;
};

export function linkLedger(input: LedgerLinkInput, ctx: LedgerContext): LedgerLinkResult {
  const nowIso = input.now.toISOString();
  const today = nowIso.slice(0, 10);
  const earliestStory = input.newsClusters
    .map((c) => c.firstSeenAt.slice(0, 10))
    .sort()[0];
  const scanFrom = [input.tradeWindowStart, earliestStory].filter(Boolean).sort()[0]!;
  const ledger = input.ledger.filter((row) => row.date >= scanFrom && row.date <= today);

  const deals = groupTradeDeals(ledger, ctx);
  const consumedDeals = new Set<TradeDeal>();
  const consumedRows = new Set<string>();
  const claims: MovementClaim[] = [...input.newsClaims];
  const resolutions: MovementResolution[] = [];
  let materialized = 0;
  let expired = 0;

  const contractRows = ledger
    .map((row) => {
      const text = ledgerSentences(row.description)
        .filter((s) => CONTRACT_SENTENCE.test(s) && !NOT_A_SIGNING.test(s) && !TRADE_SENTENCE.test(s))
        .join(" ");
      return text ? { row, text, playerIds: ctx.resolveText(text).playerIds } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  for (const cluster of input.newsClusters) {
    const family = input.families.get(cluster.id);
    const earliest = new Date(new Date(cluster.firstSeenAt).getTime() - MATCH_LEAD_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const hits = (ids: string[]) => ids.some((id) => cluster.linkedPlayerIds.includes(id));

    let matchedRows: { row: LedgerRow; text: string; playerIds: string[] }[] = [];
    if (family === "trade") {
      const deal = deals.find((d) => !consumedDeals.has(d) && d.date >= earliest && hits(d.playerIds));
      if (deal) {
        consumedDeals.add(deal);
        matchedRows = deal.rows;
        cluster.linkedTeamIds = [...new Set([...cluster.linkedTeamIds, ...deal.teamIds])];
        cluster.deal = buildDeal(deal, ctx);
        cluster.linkedTeamIds = [
          ...new Set([...cluster.linkedTeamIds, ...cluster.deal.sides.map((s) => s.teamId)]),
        ];
      }
    } else {
      const row = contractRows.find(
        (r) => !consumedRows.has(r.row.id) && r.row.date >= earliest && hits(r.playerIds)
      );
      if (row) {
        consumedRows.add(row.row.id);
        matchedRows = [row];
      }
    }

    if (matchedRows.length) {
      for (const m of matchedRows) {
        const claim = ledgerClaim(
          cluster.id,
          m.row,
          m.text,
          m.playerIds,
          family === "trade" ? "trade_interest" : "contract_movement"
        );
        claims.push(claim);
        cluster.claimIds.push(claim.id);
      }
      const last = matchedRows[matchedRows.length - 1]!;
      cluster.state = "completed";
      cluster.lastMeaningfulAt = ledgerTime(last.row.date);
      resolutions.push({
        clusterId: cluster.id,
        playerIds: cluster.linkedPlayerIds,
        outcome: "materialized",
        resolvedAt: ledgerTime(last.row.date),
        transactionRef: last.row.id,
        suppressTradeSpeculation: family === "trade",
      });
      materialized += 1;
      continue;
    }

    if (cluster.state === "unresolved" && daysBetween(cluster.lastMeaningfulAt, nowIso) > EXPIRE_DAYS) {
      cluster.state = "expired";
      resolutions.push({
        clusterId: cluster.id,
        playerIds: cluster.linkedPlayerIds,
        outcome: "expired",
        resolvedAt: nowIso,
      });
      expired += 1;
    }
  }

  const clusters: MovementStoryCluster[] = [...input.newsClusters];
  for (const deal of deals) {
    if (consumedDeals.has(deal) || deal.date < input.tradeWindowStart || !deal.playerIds.length) continue;
    const id = `mv-tx-${deal.rows[0]!.row.id}`;
    const dealClaims = deal.rows.map((m) =>
      ledgerClaim(id, m.row, m.text, m.playerIds, "trade_interest")
    );
    claims.push(...dealClaims);
    const parsed = buildDeal(deal, ctx);
    clusters.push({
      deal: parsed,
      id,
      headline: dealHeadline(deal, ctx),
      primaryClaimId: dealClaims[0]!.id,
      claimIds: dealClaims.map((c) => c.id),
      evidenceClass: "reported",
      state: "completed",
      firstSeenAt: ledgerTime(deal.date),
      lastMeaningfulAt: ledgerTime(deal.date),
      linkedPlayerIds: deal.playerIds,
      linkedTeamIds: [...new Set([...deal.teamIds, ...parsed.sides.map((s) => s.teamId)])],
    });
    resolutions.push({
      clusterId: id,
      playerIds: deal.playerIds,
      outcome: "materialized",
      resolvedAt: ledgerTime(deal.date),
      transactionRef: deal.rows[0]!.row.id,
      suppressTradeSpeculation: true,
    });
  }

  return {
    clusters,
    claims,
    resolutions,
    sources: { [ESPN_TRANSACTIONS_SOURCE_ID]: ESPN_TRANSACTIONS_TIER },
    materialized,
    expired,
  };
}
