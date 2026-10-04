/**
 * Link movement stories to the transaction ledger (ESPN plus NBA.com gap rows).
 *
 * - Trades in the current window become completed clusters on their own.
 * - A story whose player makes the same kind of move while the story is live
 *   completes when the move lands with a team the reports named (or when they
 *   named none besides his own), and falls through when it lands elsewhere.
 * - A contract story falls through when the player is traded away from the
 *   team in talks first. A trade story still open after the trade deadline
 *   falls through.
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
import { DEADLINE_GRACE_DAYS, tradeDeadlineAfter } from "@/movement-center/calendar";
import type { MovementFamily } from "@/movement-center/classify-headline";
import {
  ESPN_TRANSACTIONS_SOURCE_ID,
  ESPN_TRANSACTIONS_TIER,
  NBA_MOVEMENT_SOURCE_ID,
  NBA_MOVEMENT_TIER,
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

function ledgerSource(row: LedgerRow): { id: string; tier: MovementSourceTier } {
  return row.id.startsWith("nba-tx-")
    ? { id: NBA_MOVEMENT_SOURCE_ID, tier: NBA_MOVEMENT_TIER }
    : { id: ESPN_TRANSACTIONS_SOURCE_ID, tier: ESPN_TRANSACTIONS_TIER };
}

function ledgerClaim(
  id: string,
  clusterId: string,
  row: LedgerRow,
  text: string,
  playerIds: string[],
  claimType: MovementClaim["claimType"]
): MovementClaim {
  const source = ledgerSource(row);
  return {
    id,
    clusterId,
    summary: text,
    claimType,
    evidenceClass: "reported",
    state: "completed",
    provenanceKind: "completed_transaction",
    publishedAt: ledgerTime(row.date),
    sourceId: source.id,
    sourceLabel: source.tier.label,
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
  fellThrough: number;
  expired: number;
};

type MatchedRow = { row: LedgerRow; text: string; playerIds: string[] };

type PlayerMove = { toTeamId: string; fromTeamId?: string };

/** Where the story's players went in a parsed deal. */
function playerMoves(deal: MovementDeal, playerIds: string[]): PlayerMove[] {
  const moves: PlayerMove[] = [];
  for (const side of deal.sides) {
    for (const asset of side.receives) {
      if (!asset.playerId || !playerIds.includes(asset.playerId)) continue;
      const other = deal.sides.length === 2 ? deal.sides.find((s) => s.teamId !== side.teamId) : undefined;
      moves.push({ toTeamId: side.teamId, fromTeamId: asset.fromTeamId ?? other?.teamId });
    }
  }
  return moves;
}

function teamList(ids: string[], ctx: LedgerContext): string {
  const names = ids.map((id) => ctx.teamName(id)).filter((n): n is string => Boolean(n)).map((n) => `the ${n}`);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

function formatDeadline(date: string): string {
  return new Date(ledgerTime(date)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Verdict =
  | { kind: "completed" }
  | { kind: "fell_through"; outcome: MovementResolution["outcome"]; note: string };

const COMPLETED: Verdict = { kind: "completed" };

/**
 * A trade completes unless the reports named a destination and the player
 * went somewhere else. Teams that sent the player don't count as named
 * destinations; when the sender is unknown the trade counts as completed.
 */
function tradeVerdict(named: string[], moves: PlayerMove[], ctx: LedgerContext): Verdict {
  if (!moves.length || moves.some((m) => !m.fromTeamId)) return COMPLETED;
  const senders = new Set(moves.map((m) => m.fromTeamId));
  const targets = named.filter((id) => !senders.has(id));
  if (!targets.length || moves.some((m) => targets.includes(m.toTeamId))) return COMPLETED;
  const to = teamList([moves[0]!.toTeamId], ctx);
  const had = teamList(targets, ctx);
  if (!to || !had) return COMPLETED;
  return {
    kind: "fell_through",
    outcome: "partially_materialized",
    note: `Traded to ${to}. Reports had named ${had}.`,
  };
}

function contractVerdict(named: string[], signingTeamId: string | undefined, ctx: LedgerContext): Verdict {
  if (!named.length || !signingTeamId || named.includes(signingTeamId)) return COMPLETED;
  const signed = teamList([signingTeamId], ctx);
  const had = teamList(named, ctx);
  if (!signed || !had) return COMPLETED;
  return {
    kind: "fell_through",
    outcome: "partially_materialized",
    note: `Signed with ${signed}. Reports had named ${had}.`,
  };
}

/** A contract story whose player was traded away from every team in the reports. */
function tradedAwayVerdict(named: string[], moves: PlayerMove[], ctx: LedgerContext): Verdict | null {
  if (!named.length || !moves.length || moves.some((m) => named.includes(m.toTeamId))) return null;
  const to = teamList([moves[0]!.toTeamId], ctx);
  if (!to) return null;
  const from = moves[0]!.fromTeamId;
  const note =
    from && named.includes(from)
      ? `Traded to ${to} before a new deal with ${teamList([from], ctx)}.`
      : `Traded to ${to}. Reports had named ${teamList(named, ctx)}.`;
  return { kind: "fell_through", outcome: "did_not_materialize", note };
}

export function linkLedger(input: LedgerLinkInput, ctx: LedgerContext): LedgerLinkResult {
  const nowIso = input.now.toISOString();
  const today = nowIso.slice(0, 10);
  const earliestStory = input.newsClusters
    .map((c) => c.firstSeenAt.slice(0, 10))
    .sort()[0];
  const scanFrom = [input.tradeWindowStart, earliestStory].filter(Boolean).sort()[0]!;
  const ledger = input.ledger.filter((row) => row.date >= scanFrom && row.date <= today);

  const deals = groupTradeDeals(ledger, ctx);
  const parsedDeals = new Map<TradeDeal, MovementDeal>();
  const parsedDeal = (deal: TradeDeal) => {
    if (!parsedDeals.has(deal)) parsedDeals.set(deal, buildDeal(deal, ctx));
    return parsedDeals.get(deal)!;
  };
  const consumedDeals = new Set<TradeDeal>();
  const claims: MovementClaim[] = [...input.newsClaims];
  const claimIds = new Set(claims.map((c) => c.id));
  const claimIdFor = (rowId: string, clusterId: string) => {
    const base = `mv-${rowId}`;
    const id = claimIds.has(base) ? `${base}~${clusterId}` : base;
    claimIds.add(id);
    return id;
  };
  const sources: Record<string, MovementSourceTier> = {};
  const resolutions: MovementResolution[] = [];
  let materialized = 0;
  let fellThrough = 0;
  let expired = 0;

  const namedTeams = new Map<string, Set<string>>();
  for (const claim of input.newsClaims) {
    if (claim.provenanceKind === "completed_transaction") continue;
    const set = namedTeams.get(claim.clusterId) ?? new Set<string>();
    for (const id of claim.teamIds) set.add(id);
    namedTeams.set(claim.clusterId, set);
  }

  const contractRows = ledger
    .map((row) => {
      const text = ledgerSentences(row.description)
        .filter((s) => CONTRACT_SENTENCE.test(s) && !NOT_A_SIGNING.test(s) && !TRADE_SENTENCE.test(s))
        .join(" ");
      return text ? { row, text, playerIds: ctx.resolveText(text).playerIds } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const attach = (cluster: MovementStoryCluster, rows: MatchedRow[], claimType: MovementClaim["claimType"]) => {
    for (const m of rows) {
      const source = ledgerSource(m.row);
      sources[source.id] = source.tier;
      const claim = ledgerClaim(claimIdFor(m.row.id, cluster.id), cluster.id, m.row, m.text, m.playerIds, claimType);
      claims.push(claim);
      cluster.claimIds.push(claim.id);
    }
  };

  for (const cluster of input.newsClusters) {
    if (cluster.state !== "unresolved" && cluster.state !== "denied") continue;
    const family = input.families.get(cluster.id);
    const earliest = new Date(new Date(cluster.firstSeenAt).getTime() - MATCH_LEAD_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const expiresAt = new Date(new Date(cluster.lastMeaningfulAt).getTime() + EXPIRE_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const live = (date: string) => date >= earliest && date <= expiresAt;
    const hits = (ids: string[]) => ids.some((id) => cluster.linkedPlayerIds.includes(id));
    const named = [...(namedTeams.get(cluster.id) ?? [])];

    let matchedRows: MatchedRow[] = [];
    let matchedTrade = family === "trade";
    let verdict: Verdict | null = null;
    if (family === "trade") {
      const deal = deals.find((d) => live(d.date) && hits(d.playerIds));
      if (deal) {
        consumedDeals.add(deal);
        matchedRows = deal.rows;
        cluster.deal = parsedDeal(deal);
        cluster.linkedTeamIds = [
          ...new Set([...cluster.linkedTeamIds, ...deal.teamIds, ...cluster.deal.sides.map((s) => s.teamId)]),
        ];
        verdict = tradeVerdict(named, playerMoves(cluster.deal, cluster.linkedPlayerIds), ctx);
      }
    } else {
      const row = contractRows.find((r) => live(r.row.date) && hits(r.playerIds));
      if (row) {
        matchedRows = [row];
        verdict = contractVerdict(named, row.row.teamIds[0], ctx);
      } else {
        const deal = deals.find((d) => live(d.date) && hits(d.playerIds));
        const away = deal
          ? tradedAwayVerdict(named, playerMoves(parsedDeal(deal), cluster.linkedPlayerIds), ctx)
          : null;
        if (deal && away) {
          matchedRows = deal.rows;
          matchedTrade = true;
          verdict = away;
        }
      }
    }

    if (matchedRows.length && verdict) {
      attach(cluster, matchedRows, matchedTrade ? "trade_interest" : "contract_movement");
      const last = matchedRows[matchedRows.length - 1]!;
      cluster.lastMeaningfulAt = ledgerTime(last.row.date);
      if (verdict.kind === "completed") {
        cluster.state = "completed";
        resolutions.push({
          clusterId: cluster.id,
          playerIds: cluster.linkedPlayerIds,
          outcome: "materialized",
          resolvedAt: ledgerTime(last.row.date),
          transactionRef: last.row.id,
          suppressTradeSpeculation: family === "trade",
        });
        materialized += 1;
      } else {
        cluster.state = "fell_through";
        cluster.resolutionNote = verdict.note;
        resolutions.push({
          clusterId: cluster.id,
          playerIds: cluster.linkedPlayerIds,
          outcome: verdict.outcome,
          resolvedAt: ledgerTime(last.row.date),
          transactionRef: last.row.id,
          note: verdict.note,
          suppressTradeSpeculation: family === "trade",
        });
        fellThrough += 1;
      }
      continue;
    }

    const deadline = family === "trade" ? tradeDeadlineAfter(cluster.firstSeenAt) : null;
    if (
      deadline &&
      deadline <= expiresAt &&
      daysBetween(ledgerTime(deadline), nowIso) > DEADLINE_GRACE_DAYS
    ) {
      const note = `No trade by the ${formatDeadline(deadline)} deadline.`;
      cluster.state = "fell_through";
      cluster.resolutionNote = note;
      resolutions.push({
        clusterId: cluster.id,
        playerIds: cluster.linkedPlayerIds,
        outcome: "did_not_materialize",
        resolvedAt: ledgerTime(deadline),
        note,
      });
      fellThrough += 1;
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
    const dealClaims = deal.rows.map((m) => {
      const source = ledgerSource(m.row);
      sources[source.id] = source.tier;
      return ledgerClaim(claimIdFor(m.row.id, id), id, m.row, m.text, m.playerIds, "trade_interest");
    });
    claims.push(...dealClaims);
    const parsed = parsedDeal(deal);
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
    sources,
    materialized,
    fellThrough,
    expired,
  };
}
