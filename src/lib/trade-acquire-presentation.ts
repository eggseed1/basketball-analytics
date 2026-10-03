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

export type TradeAcquireAsset = ParsedTradeAsset & {
  /** Set when only the partner team's ESPN entry lists this item. */
  onlyListedBy?: string;
};

export type TradeAcquireSide = {
  teamId: string;
  teamAbbr: string;
  assets: TradeAcquireAsset[];
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
  assets: TradeAcquireAsset[]
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
  const counterpartSent = new Map<
    string,
    {
      brand: NonNullable<ReturnType<typeof resolveTeamBrand>>;
      assets: ParsedTradeAsset[];
      listedBy: string;
    }
  >();
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
    const counter = brandForHint(parsed.counterpartyHint);
    if (counter && counter.espnTeamId !== brand.espnTeamId && parsed.sent.length) {
      const prior = counterpartSent.get(counter.espnTeamId);
      counterpartSent.set(counter.espnTeamId, {
        brand: counter,
        assets: prior ? mergeAssets(prior.assets, parsed.sent) : parsed.sent,
        listedBy: brand.abbr,
      });
    }
    if (!bestPattern || parsed.pattern !== "acquired_from") {
      bestPattern = parsed.pattern;
    }
  }

  // One team's blurb can list what it gave up while the partner's blurb
  // leaves it out (ESPN's "draft considerations"). Fill those in, but never
  // stack a second pick or cash line onto a side that already names one in
  // its own words.
  for (const [teamId, { brand, assets, listedBy }] of counterpartSent) {
    const side = byTeam.get(teamId);
    if (!side) continue;
    const extra = assets.filter((asset) =>
      asset.kind === "player"
        ? !side.assets.some((a) => a.kind === "player" && a.matchKey === asset.matchKey)
        : !side.assets.some((a) => a.kind === asset.kind)
    );
    if (extra.length) {
      byTeam.set(
        teamId,
        sideFromBrand(brand, [
          ...side.assets,
          ...extra.map((asset) => ({ ...asset, onlyListedBy: listedBy })),
        ])
      );
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

const SENTENCE_BREAK = /(?<!\b(?:Jr|Sr|St|Mr|[A-Z]))\.\s+(?=[A-Z])/;
const TRADE_SENTENCE = /\b(acquired|traded|in exchange for|sign-and-trade)\b/i;

/**
 * ESPN bundles a team's same-day moves into one blurb. When the trade part
 * renders as acquire boxes, the signings and waivers around it still need
 * to show.
 */
export function nonTradeSentences(description: string): string {
  return description
    .replace(/\s+/g, " ")
    .trim()
    .split(SENTENCE_BREAK)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s && !TRADE_SENTENCE.test(s))
    .map((s) => `${s}.`)
    .join(" ");
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
