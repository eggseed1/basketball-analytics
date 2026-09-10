/**
 * Build two-sided "Team acquires" presentation from ESPN trade blurbs.
 * Heuristic only — mirrors parseTradeSides; not a verified ownership ledger.
 */

import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import { resolveTeamBrand } from "@/lib/nba-brand";
import {
  parseTradeSides,
  type ParsedTradeAsset,
  type ParsedTradeSides,
} from "@/lib/trade-tree-parse";

export type TradeAcquireSide = {
  teamId: string;
  teamAbbr: string;
  assets: ParsedTradeAsset[];
};

export type TradeAcquirePresentation = {
  sides: TradeAcquireSide[];
  pattern: ParsedTradeSides["pattern"];
};

function brandForEvent(event: NbaTransactionEvent) {
  return resolveTeamBrand(event.teamId) ?? resolveTeamBrand(event.teamAbbr);
}

function brandForHint(hint: string | null) {
  if (!hint) return undefined;
  return resolveTeamBrand(hint);
}

function isStructuredPattern(pattern: ParsedTradeSides["pattern"]): boolean {
  return (
    pattern === "traded_to_for" ||
    pattern === "acquired_in_exchange" ||
    pattern === "acquired_for" ||
    pattern === "acquired_from"
  );
}

function sideFromBrand(
  brand: NonNullable<ReturnType<typeof resolveTeamBrand>>,
  assets: ParsedTradeAsset[]
): TradeAcquireSide {
  return {
    teamId: brand.espnTeamId,
    teamAbbr: brand.abbr,
    assets,
  };
}

/**
 * Two stacked acquire sides from a single posting-team ESPN blurb.
 * Returns null when both teams / hauls cannot be derived cleanly.
 */
export function tradeAcquirePresentationFromEvent(
  event: NbaTransactionEvent
): TradeAcquirePresentation | null {
  const sides = parseTradeSides(event.description);
  if (!isStructuredPattern(sides.pattern)) return null;
  if (!sides.got.length && !sides.sent.length) return null;

  const posting = brandForEvent(event);
  const counter = brandForHint(sides.counterpartyHint);
  if (!posting || !counter) return null;
  if (posting.espnTeamId === counter.espnTeamId) return null;

  // One-way "acquired from" without outbound assets — still show both boxes
  // when we know the counterparty, so the trade is not Minnesota-only.
  return {
    pattern: sides.pattern,
    sides: [
      sideFromBrand(posting, sides.got),
      sideFromBrand(counter, sides.sent),
    ],
  };
}

/**
 * Prefer each team's own "got" haul when a cluster has multiple ESPN blurbs.
 * Falls back to flipping the best single structured parse.
 */
export function tradeAcquirePresentationFromEvents(
  events: NbaTransactionEvent[]
): TradeAcquirePresentation | null {
  if (!events.length) return null;

  const byTeam = new Map<string, TradeAcquireSide>();
  let bestPattern: ParsedTradeSides["pattern"] = null;

  for (const event of events) {
    const parsed = parseTradeSides(event.description);
    if (!isStructuredPattern(parsed.pattern) || !parsed.got.length) continue;
    const brand = brandForEvent(event);
    if (!brand) continue;
    const existing = byTeam.get(brand.espnTeamId);
    byTeam.set(
      brand.espnTeamId,
      sideFromBrand(
        brand,
        existing ? mergeAssets(existing.assets, parsed.got) : parsed.got
      )
    );
    if (!bestPattern || parsed.pattern !== "acquired_from") {
      bestPattern = parsed.pattern;
    }
  }

  if (byTeam.size >= 2) {
    return {
      pattern: bestPattern,
      sides: [...byTeam.values()].sort((a, b) =>
        a.teamAbbr.localeCompare(b.teamAbbr)
      ),
    };
  }

  for (const event of events) {
    const fromOne = tradeAcquirePresentationFromEvent(event);
    if (fromOne && fromOne.sides.length === 2) return fromOne;
  }

  return null;
}

function mergeAssets(
  a: ParsedTradeAsset[],
  b: ParsedTradeAsset[]
): ParsedTradeAsset[] {
  const seen = new Set<string>();
  const out: ParsedTradeAsset[] = [];
  for (const asset of [...a, ...b]) {
    const key = `${asset.kind}:${asset.matchKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}
