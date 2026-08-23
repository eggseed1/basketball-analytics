/**
 * Classic forward + backward trade genealogy from ESPN free-text events.
 * Best-effort archive matching — not a verified ownership ledger.
 */

import "server-only";

import {
  buildTransactionEventIndex,
  filterTransactionEvents,
  getRelatedClusterForEvent,
} from "@/data/providers/transactions/transaction-event-index";
import { getMasterPlayerRegistry } from "@/data/history/player-universe";
import { resolveCanonicalTeam } from "@/data/identity/team-map";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { normalizePlayerName } from "@/lib/player-name";
import {
  descriptionMentionsAsset,
  isTradeLikeEvent,
  assetOutboundInEvent,
  parseTradeSides,
  type ParsedTradeAsset,
} from "@/lib/trade-tree-parse";
import type { NbaTransactionEvent } from "@/data/types/transaction-event";
import type {
  TeamTradeTree,
  TradeTreeAsset,
  TradeTreeDisposition,
  TradeTreeNode,
  TradeTreePlayerHit,
  TradeTreeRootOption,
} from "@/data/types/team-trade-tree";

export type {
  TeamTradeTree,
  TradeTreeAsset,
  TradeTreeNode,
  TradeTreePlayerHit,
  TradeTreeRootOption,
} from "@/data/types/team-trade-tree";

/** Deep enough for multi-hop packages; archive usually ends sooner. */
const MAX_DEPTH = 14;
/** Keep a large deal list so the player catalog stays complete. */
const MAX_ROOT_OPTIONS = 400;

type ParsedSides = ReturnType<typeof parseTradeSides>;

type WalkContext = {
  events: NbaTransactionEvent[];
  /** normalizePlayerName(description) — space-stripped for cheap includes */
  haystacks: string[];
  parseCache: Map<string, ParsedSides>;
};

/** Process cache: team catalog without genealogy walk. */
const teamCatalogMemory = new Map<
  string,
  {
    expiresAt: number;
    indexBuiltAt: string;
    ranked: Array<{
      sides: ParsedSides;
      sourceEvent: NbaTransactionEvent;
      score: number;
    }>;
    playerCatalog: TradeTreePlayerHit[];
  }
>();
const TEAM_CATALOG_TTL_MS = 1000 * 60 * 15;

function parseSidesCached(
  description: string,
  cache: Map<string, ParsedSides>
): ParsedSides {
  const hit = cache.get(description);
  if (hit) return hit;
  const parsed = parseTradeSides(description);
  cache.set(description, parsed);
  return parsed;
}

function lastNameKey(matchKey: string): string {
  // matchKey is already alnum-only; approximate last token by taking a suffix
  // after common first-name lengths is unreliable — use full key + trailing 5+ chars
  if (matchKey.length <= 6) return matchKey;
  // Prefer longest suffix that still filters well: last 8–14 chars covers last names
  return matchKey.slice(-10);
}

function buildWalkContext(eventsNewestFirst: NbaTransactionEvent[]): WalkContext {
  // Index stores newest-first; walks need ascending for binary search.
  const events = [...eventsNewestFirst].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  );
  const haystacks = events.map((e) => normalizePlayerName(e.description));
  return { events, haystacks, parseCache: new Map() };
}

function lowerBoundDate(events: NbaTransactionEvent[], date: string): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.date < date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundDate(events: NbaTransactionEvent[], date: string): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.date <= date) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Cheap prefilter then exact mention check — avoids full-archive asset scans. */
function pickYearHint(label: string): string | null {
  const m = label.match(/\b(19|20)\d{2}\b/);
  return m ? m[0]! : null;
}

function candidateEvents(
  ctx: WalkContext,
  asset: TradeTreeAsset,
  range: { afterDate?: string; beforeDate?: string }
): NbaTransactionEvent[] {
  const start = range.afterDate
    ? upperBoundDate(ctx.events, range.afterDate)
    : 0;
  const end = range.beforeDate
    ? lowerBoundDate(ctx.events, range.beforeDate)
    : ctx.events.length;

  const needle = asset.matchKey;
  const last = lastNameKey(asset.matchKey);
  const year = asset.kind === "pick" ? pickYearHint(asset.label) : null;
  const out: NbaTransactionEvent[] = [];

  for (let i = start; i < end; i++) {
    const h = ctx.haystacks[i]!;
    if (asset.kind === "pick") {
      if (year && h.includes(year) && (h.includes("pick") || h.includes("draft"))) {
        out.push(ctx.events[i]!);
        continue;
      }
      if (needle.length >= 6 && h.includes(needle)) out.push(ctx.events[i]!);
      continue;
    }
    if (!(h.includes(last) || (needle.length >= 5 && h.includes(needle)))) {
      continue;
    }
    out.push(ctx.events[i]!);
  }

  if (range.beforeDate) {
    // Prior acquisition wants newest first
    out.reverse();
  }
  return out;
}

function brandAbbr(teamId: string): string {
  return resolveTeamBrand(teamId)?.abbr ?? teamId;
}

function brandName(teamId: string): string {
  const b = resolveTeamBrand(teamId);
  if (!b) return teamId;
  return b.abbr;
}

function eventMentionsTeam(description: string, teamId: string): boolean {
  const lower = description.toLowerCase();
  const brand = resolveTeamBrand(teamId);
  const meta = ESPN_TEAM_META[teamId];
  const needles = new Set<string>();
  if (brand?.abbr) needles.add(brand.abbr.toLowerCase());
  if (meta?.city) needles.add(meta.city.toLowerCase());
  // Common nicknames by city token
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

function toAsset(
  parsed: ParsedTradeAsset,
  nameToId: Map<string, string>,
  focusMatchKey?: string | null
): TradeTreeAsset {
  const playerId =
    parsed.kind === "player" ? (nameToId.get(parsed.matchKey) ?? null) : null;
  return {
    id: `${parsed.kind}:${parsed.matchKey}`,
    kind: parsed.kind,
    label: parsed.label,
    matchKey: parsed.matchKey,
    playerId,
    positionHint: parsed.positionHint ?? null,
    focused: Boolean(
      focusMatchKey && parsed.matchKey === focusMatchKey
    ),
  };
}

function markFocused(
  assets: TradeTreeAsset[],
  focusMatchKey?: string | null
): TradeTreeAsset[] {
  if (!focusMatchKey) return assets;
  return assets.map((a) =>
    a.matchKey === focusMatchKey ? { ...a, focused: true } : a
  );
}

function buildNameIndex(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    for (const p of getMasterPlayerRegistry()) {
      const key = normalizePlayerName(p.displayName);
      if (!key || key.length < 4) continue;
      if (!map.has(key)) map.set(key, p.playerId);
    }
  } catch {
    // registry optional
  }
  return map;
}

function scoreRoot(sides: ReturnType<typeof parseTradeSides>): number {
  const got = sides.got.length;
  const sent = sides.sent.length;
  if (got === 0 && sent === 0) return -1;
  return (
    got * 3 +
    sent * 2 +
    (sides.pattern && sides.pattern !== "fallback" ? 5 : 0)
  );
}

function resolveFocusSides(
  event: NbaTransactionEvent,
  focusTeamId: string,
  index: Awaited<ReturnType<typeof buildTransactionEventIndex>>
): {
  sides: ReturnType<typeof parseTradeSides>;
  sourceEvent: NbaTransactionEvent;
  flipped: boolean;
} {
  if (event.teamId === focusTeamId) {
    return {
      sides: parseTradeSides(event.description),
      sourceEvent: event,
      flipped: false,
    };
  }
  const related = getRelatedClusterForEvent(index, event.id);
  if (related) {
    const home = related.events.find((e) => e.teamId === focusTeamId);
    if (home) {
      return {
        sides: parseTradeSides(home.description),
        sourceEvent: home,
        flipped: false,
      };
    }
  }
  // Partner blurb only — flip sides so "got" is focus inbound
  const sides = parseTradeSides(event.description);
  return {
    sides: {
      got: sides.sent,
      sent: sides.got,
      counterpartyHint: brandAbbr(event.teamId),
      pattern: sides.pattern,
    },
    sourceEvent: event,
    flipped: true,
  };
}


function findDisposition(
  asset: TradeTreeAsset,
  focusTeamId: string,
  afterDate: string,
  ctx: WalkContext
): {
  disposition: TradeTreeDisposition;
  event: NbaTransactionEvent | null;
  returnAssets: ParsedTradeAsset[];
} {
  if (asset.kind === "cash" || asset.kind === "other") {
    return {
      disposition: { kind: "terminal", note: "Cash / other — end of branch" },
      event: null,
      returnAssets: [],
    };
  }

  const parsedAsset: ParsedTradeAsset = {
    kind: asset.kind,
    label: asset.label,
    matchKey: asset.matchKey,
    positionHint: asset.positionHint,
  };

  const later = candidateEvents(ctx, asset, { afterDate }).filter((e) => {
    if (asset.kind === "player") {
      return descriptionMentionsAsset(e.description, parsedAsset);
    }
    const year = pickYearHint(asset.label);
    const d = e.description.toLowerCase();
    if (descriptionMentionsAsset(e.description, parsedAsset)) return true;
    if (year && d.includes(year) && /\bpick\b|\bdraft\b/.test(d)) return true;
    return false;
  });

  for (const e of later) {
    if (e.teamId === focusTeamId) {
      if (
        asset.kind === "player" &&
        /\bwaived\b|\breleased\b/i.test(e.description) &&
        descriptionMentionsAsset(e.description, parsedAsset)
      ) {
        return {
          disposition: { kind: "waived", date: e.date, eventId: e.id },
          event: e,
          returnAssets: [],
        };
      }

      if (
        asset.kind === "pick" &&
        /\bdrafted\b|\bselected\b/i.test(e.description)
      ) {
        const drafted = parseSidesCached(e.description, ctx.parseCache).got.filter(
          (a) => a.kind === "player"
        );
        return {
          disposition: {
            kind: "drafted",
            date: e.date,
            eventId: e.id,
            playerLabel: drafted[0]?.label,
          },
          event: e,
          returnAssets: drafted,
        };
      }

      if (
        asset.kind === "player" &&
        /\bsigned\b|\bre-signed\b|\bresigned\b/i.test(e.description) &&
        !isTradeLikeEvent(e.sourceTextCategory, e.description)
      ) {
        continue;
      }

      if (
        isTradeLikeEvent(e.sourceTextCategory, e.description) &&
        assetOutboundInEvent(e.description, parsedAsset)
      ) {
        const sides = parseSidesCached(e.description, ctx.parseCache);
        return {
          disposition: {
            kind: "traded",
            toTeamAbbr: sides.counterpartyHint,
            date: e.date,
            eventId: e.id,
          },
          event: e,
          returnAssets: sides.got,
        };
      }
    }

    if (
      e.teamId !== focusTeamId &&
      isTradeLikeEvent(e.sourceTextCategory, e.description)
    ) {
      if (!eventMentionsTeam(e.description, focusTeamId)) {
        continue;
      }
      const sides = parseSidesCached(e.description, ctx.parseCache);
      const partnerGotAsset = sides.got.some(
        (g) =>
          g.matchKey === asset.matchKey ||
          descriptionMentionsAsset(g.label, parsedAsset) ||
          descriptionMentionsAsset(asset.label, g)
      );
      if (!partnerGotAsset) {
        continue;
      }
      return {
        disposition: {
          kind: "traded",
          toTeamAbbr: brandAbbr(e.teamId),
          date: e.date,
          eventId: e.id,
        },
        event: e,
        returnAssets: sides.sent,
      };
    }
  }

  return {
    disposition: {
      kind: "open",
      note:
        asset.kind === "player"
          ? "No later archive move found"
          : "Pick not traced further in archive",
    },
    event: null,
    returnAssets: [],
  };
}

function findPriorAcquisition(
  asset: TradeTreeAsset,
  focusTeamId: string,
  beforeDate: string,
  ctx: WalkContext
): {
  disposition: TradeTreeDisposition;
  event: NbaTransactionEvent | null;
  priorHaul: ParsedTradeAsset[];
} {
  if (asset.kind !== "player" && asset.kind !== "pick") {
    return {
      disposition: { kind: "terminal", note: "No prior walk" },
      event: null,
      priorHaul: [],
    };
  }
  if (asset.kind === "pick") {
    return {
      disposition: {
        kind: "open",
        note: "Pick provenance not traced in archive",
      },
      event: null,
      priorHaul: [],
    };
  }

  const parsedAsset: ParsedTradeAsset = {
    kind: asset.kind,
    label: asset.label,
    matchKey: asset.matchKey,
    positionHint: asset.positionHint,
  };

  const earlier = candidateEvents(ctx, asset, { beforeDate }).filter((e) =>
    e.teamId === focusTeamId
      ? descriptionMentionsAsset(e.description, parsedAsset) ||
        (asset.kind === "pick" &&
          Boolean(pickYearHint(asset.label)) &&
          e.description.includes(pickYearHint(asset.label)!) &&
          /\bpick\b|\bdraft\b/i.test(e.description))
      : descriptionMentionsAsset(e.description, parsedAsset)
  );

  for (const e of earlier) {
    if (e.teamId !== focusTeamId) continue;
    if (/\bdrafted\b|\bselected\b/i.test(e.description)) {
      return {
        disposition: {
          kind: "drafted",
          date: e.date,
          eventId: e.id,
          playerLabel: asset.label,
        },
        event: e,
        priorHaul: [],
      };
    }
    if (
      /\bsigned\b|\bre-signed\b|\bresigned\b|\bclaimed\b/i.test(e.description) &&
      !isTradeLikeEvent(e.sourceTextCategory, e.description)
    ) {
      return {
        disposition: { kind: "signed", date: e.date, eventId: e.id },
        event: e,
        priorHaul: [],
      };
    }
    if (isTradeLikeEvent(e.sourceTextCategory, e.description)) {
      const sides = parseSidesCached(e.description, ctx.parseCache);
      const gotUs = sides.got.some(
        (g) =>
          g.matchKey === asset.matchKey ||
          descriptionMentionsAsset(g.label, parsedAsset)
      );
      if (gotUs) {
        return {
          disposition: {
            kind: "acquired",
            fromTeamAbbr: sides.counterpartyHint,
            date: e.date,
            eventId: e.id,
          },
          event: e,
          priorHaul: sides.sent,
        };
      }
    }
  }

  return {
    disposition: {
      kind: "open",
      note: "Earliest archive mention — prior acquisition unknown",
    },
    event: null,
    priorHaul: [],
  };
}

function walkBranch(options: {
  focusTeamId: string;
  haul: ParsedTradeAsset[];
  date: string;
  eventId: string;
  description: string;
  via: TradeTreeDisposition | null;
  depth: number;
  visited: Set<string>;
  ctx: WalkContext;
  nameToId: Map<string, string>;
  focusMatchKey?: string | null;
  direction: "forward" | "backward";
}): TradeTreeNode {
  const assets = markFocused(
    options.haul.map((a) =>
      toAsset(a, options.nameToId, options.focusMatchKey)
    ),
    options.focusMatchKey
  );
  const children: TradeTreeNode["children"] = [];

  if (options.depth < MAX_DEPTH) {
    for (const asset of assets) {
      if (asset.kind === "cash" || asset.kind === "other") {
        children.push({
          fromAssetId: asset.id,
          fromAssetLabel: asset.label,
          disposition: {
            kind: "terminal",
            note: "Cash / other — end of branch",
          },
          node: null,
        });
        continue;
      }
      if (options.visited.has(asset.matchKey)) continue;
      const nextVisited = new Set(options.visited);
      nextVisited.add(asset.matchKey);

      if (options.direction === "forward") {
        const found = findDisposition(
          asset,
          options.focusTeamId,
          options.date,
          options.ctx
        );

        if (
          found.disposition.kind === "open" ||
          found.disposition.kind === "waived" ||
          found.disposition.kind === "terminal" ||
          found.disposition.kind === "signed"
        ) {
          children.push({
            fromAssetId: asset.id,
            fromAssetLabel: asset.label,
            disposition: found.disposition,
            node: null,
          });
          continue;
        }

        const childNode =
          found.returnAssets.length > 0 && found.event
            ? walkBranch({
                focusTeamId: options.focusTeamId,
                haul: found.returnAssets,
                date: found.event.date,
                eventId: found.event.id,
                description: found.event.description,
                via: found.disposition,
                depth: options.depth + 1,
                visited: nextVisited,
                ctx: options.ctx,
                nameToId: options.nameToId,
                focusMatchKey: options.focusMatchKey,
                direction: "forward",
              })
            : null;

        children.push({
          fromAssetId: asset.id,
          fromAssetLabel: asset.label,
          disposition: found.disposition,
          node: childNode,
        });
      } else {
        const prior = findPriorAcquisition(
          asset,
          options.focusTeamId,
          options.date,
          options.ctx
        );

        if (
          prior.disposition.kind === "open" ||
          prior.disposition.kind === "terminal" ||
          prior.disposition.kind === "signed" ||
          prior.disposition.kind === "drafted" ||
          prior.priorHaul.length === 0 ||
          !prior.event
        ) {
          children.push({
            fromAssetId: asset.id,
            fromAssetLabel: asset.label,
            disposition: prior.disposition,
            node: null,
          });
          continue;
        }

        const childNode = walkBranch({
          focusTeamId: options.focusTeamId,
          haul: prior.priorHaul,
          date: prior.event.date,
          eventId: prior.event.id,
          description: prior.event.description,
          via: prior.disposition,
          depth: options.depth + 1,
          visited: nextVisited,
          ctx: options.ctx,
          nameToId: options.nameToId,
          focusMatchKey: options.focusMatchKey,
          direction: "backward",
        });

        children.push({
          fromAssetId: asset.id,
          fromAssetLabel: asset.label,
          disposition: prior.disposition,
          node: childNode,
        });
      }
    }
  }

  return {
    id: `${options.direction}:${options.eventId}:${options.depth}`,
    teamId: options.focusTeamId,
    teamAbbr: brandAbbr(options.focusTeamId),
    date: options.date,
    eventId: options.eventId,
    description: "",
    assets,
    via: options.via,
    children,
  };
}

function countBranches(node: TradeTreeNode): number {
  let n = 0;
  for (const c of node.children) {
    if (c.node) n += 1 + countBranches(c.node);
    else if (c.disposition.kind !== "open") n += 1;
  }
  return n;
}

function maxDepth(node: TradeTreeNode, d = 0): number {
  let m = d;
  for (const c of node.children) {
    if (c.node) m = Math.max(m, maxDepth(c.node, d + 1));
  }
  return m;
}

function rootLabel(sides: ParsedSides, date: string): string {
  const sent = sides.sent.filter((a) => a.kind === "player").slice(0, 2);
  const got = sides.got.filter((a) => a.kind === "player").slice(0, 2);
  const left = sent.map((s) => s.label).join(", ") || "package";
  const right = got.map((g) => g.label).join(", ") || "return";
  return `${date} · ${left} → ${right}`;
}

function emptyNode(teamId: string): TradeTreeNode {
  return {
    id: "empty",
    teamId,
    teamAbbr: brandAbbr(teamId),
    date: "",
    eventId: "",
    description: "",
    assets: [],
    via: null,
    children: [],
  };
}

function emptyTree(
  teamId: string,
  brand: ReturnType<typeof resolveTeamBrand>,
  playerCatalog: TradeTreePlayerHit[],
  disclaimer?: string
): TeamTradeTree {
  return {
    teamId,
    teamAbbr: brand?.abbr ?? teamId,
    teamName: brandName(teamId),
    rootEventId: "",
    title: `${brandAbbr(teamId)} trade tree`,
    rootDate: "",
    focusPlayerMatchKey: null,
    focusPlayerLabel: null,
    rootSent: [],
    rootCounterparties: [],
    ancestry: [],
    root: emptyNode(teamId),
    rootOptions: [],
    playerCatalog,
    depth: 0,
    branchCount: 0,
    ancestryDepth: 0,
    disclaimer:
      disclaimer ??
      "No parseable trade blurbs found for this team in the ESPN archive.",
  };
}

function scoreTeamAnchors(
  teamId: string,
  index: Awaited<ReturnType<typeof buildTransactionEventIndex>>,
  nameToId: Map<string, string>
): {
  ranked: Array<{
    sides: ParsedSides;
    sourceEvent: NbaTransactionEvent;
    score: number;
  }>;
  playerCatalog: TradeTreePlayerHit[];
} {
  const cached = teamCatalogMemory.get(teamId);
  if (
    cached &&
    cached.expiresAt > Date.now() &&
    cached.indexBuiltAt === index.builtAt
  ) {
    return { ranked: cached.ranked, playerCatalog: cached.playerCatalog };
  }

  const teamEvents = filterTransactionEvents(index, { teamId });
  const tradeCandidates = teamEvents.filter((e) =>
    isTradeLikeEvent(e.sourceTextCategory, e.description)
  );
  const tradeDates = new Set(tradeCandidates.map((t) => t.date));

  const partnerAnchors: NbaTransactionEvent[] = [];
  for (const e of index.events) {
    if (e.teamId === teamId) continue;
    if (!isTradeLikeEvent(e.sourceTextCategory, e.description)) continue;
    if (!eventMentionsTeam(e.description, teamId)) continue;
    if (tradeDates.has(e.date)) continue;
    partnerAnchors.push(e);
  }

  const anchors = [...tradeCandidates, ...partnerAnchors];
  const scored: Array<{
    sides: ParsedSides;
    sourceEvent: NbaTransactionEvent;
    score: number;
  }> = [];

  for (const event of anchors) {
    const { sides, sourceEvent } = resolveFocusSides(event, teamId, index);
    const score = scoreRoot(sides);
    if (score < 0) continue;
    scored.push({ sides, sourceEvent, score });
  }

  const byId = new Map<string, (typeof scored)[number]>();
  for (const row of scored) {
    const prev = byId.get(row.sourceEvent.id);
    if (!prev || row.score > prev.score) byId.set(row.sourceEvent.id, row);
  }
  const ranked = [...byId.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.sourceEvent.date.localeCompare(a.sourceEvent.date)
    )
    .slice(0, MAX_ROOT_OPTIONS);

  const catalogByKey = new Map<string, TradeTreePlayerHit>();
  for (const r of ranked) {
    const dealLabel = rootLabel(r.sides, r.sourceEvent.date);
    for (const a of r.sides.got.filter((x) => x.kind === "player")) {
      const asset = toAsset(a, nameToId);
      const prev = catalogByKey.get(asset.matchKey);
      if (!prev || r.sourceEvent.date > prev.date) {
        catalogByKey.set(asset.matchKey, {
          label: asset.label,
          matchKey: asset.matchKey,
          playerId: asset.playerId,
          eventId: r.sourceEvent.id,
          date: r.sourceEvent.date,
          counterpartyAbbr: r.sides.counterpartyHint,
          dealLabel,
        });
      }
    }
  }
  const playerCatalog = [...catalogByKey.values()].sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  teamCatalogMemory.set(teamId, {
    expiresAt: Date.now() + TEAM_CATALOG_TTL_MS,
    indexBuiltAt: index.builtAt,
    ranked,
    playerCatalog,
  });

  return { ranked, playerCatalog };
}

export async function buildTeamTradeTree(options: {
  teamId: string;
  rootEventId?: string;
  /** Normalized or display player name / matchKey from search. */
  focusPlayer?: string;
}): Promise<TeamTradeTree | null> {
  const resolved = resolveCanonicalTeam(options.teamId);
  const teamId =
    resolved.status === "resolved"
      ? resolved.team.canonicalTeamId
      : options.teamId;
  const brand = resolveTeamBrand(teamId);
  const index = await buildTransactionEventIndex();
  const nameToId = buildNameIndex();

  const { ranked, playerCatalog } = scoreTeamAnchors(teamId, index, nameToId);

  if (!ranked.length) {
    return emptyTree(teamId, brand, playerCatalog);
  }

  const focusRaw = options.focusPlayer?.trim() ?? "";
  const focusKey = focusRaw ? normalizePlayerName(focusRaw) : "";
  const catalogHit = focusKey
    ? [...playerCatalog]
        .filter(
          (p) =>
            p.matchKey === focusKey ||
            p.matchKey.includes(focusKey) ||
            focusKey.includes(p.matchKey) ||
            normalizePlayerName(p.label) === focusKey ||
            p.label.toLowerCase() === focusRaw.toLowerCase()
        )
        .sort((a, b) => a.date.localeCompare(b.date))[0]
    : null;

  const focusAcquisition =
    focusKey
      ? [...ranked]
          .filter((r) =>
            r.sides.got.some(
              (g) =>
                g.matchKey === focusKey ||
                g.matchKey.includes(focusKey) ||
                focusKey.includes(g.matchKey)
            )
          )
          .sort((a, b) =>
            a.sourceEvent.date.localeCompare(b.sourceEvent.date)
          )[0]
      : null;

  const wantsDeepWalk = Boolean(catalogHit || focusAcquisition || options.rootEventId?.trim());

  // Fast path: team selected, no player/root yet — catalog only.
  if (!wantsDeepWalk) {
    return {
      ...emptyTree(
        teamId,
        brand,
        playerCatalog,
        `Search a player ${brandAbbr(teamId)} acquired to open the full forward + backward genealogy.`
      ),
      title: `How did ${brandAbbr(teamId)} get…`,
      playerCatalog,
    };
  }

  const chosen =
    (catalogHit
      ? ranked.find((r) => r.sourceEvent.id === catalogHit.eventId)
      : null) ??
    focusAcquisition ??
    (options.rootEventId
      ? ranked.find((r) => r.sourceEvent.id === options.rootEventId)
      : null) ??
    ranked[0]!;

  const { sides, sourceEvent } = chosen;
  const focusPlayerMatchKey =
    catalogHit?.matchKey ??
    (focusKey
      ? sides.got.find(
          (g) => g.matchKey === focusKey || g.matchKey.includes(focusKey)
        )?.matchKey ?? null
      : null);
  const focusPlayerLabel =
    catalogHit?.label ??
    sides.got.find((g) => g.matchKey === focusPlayerMatchKey)?.label ??
    null;

  const related = getRelatedClusterForEvent(index, sourceEvent.id);
  const counterparties: TeamTradeTree["rootCounterparties"] = [];
  if (related) {
    for (const ev of related.events) {
      if (ev.teamId === teamId) continue;
      const ps = parseTradeSides(ev.description);
      counterparties.push({
        teamId: ev.teamId,
        teamAbbr: brandAbbr(ev.teamId),
        assets: markFocused(
          ps.got.map((a) => toAsset(a, nameToId, focusPlayerMatchKey)),
          focusPlayerMatchKey
        ),
        description: "",
        eventId: ev.id,
      });
    }
  } else if (sides.sent.length && sides.counterpartyHint) {
    const cpBrand = resolveTeamBrand(sides.counterpartyHint);
    counterparties.push({
      teamId: cpBrand?.espnTeamId ?? sides.counterpartyHint,
      teamAbbr: sides.counterpartyHint,
      assets: markFocused(
        sides.sent.map((a) => toAsset(a, nameToId, focusPlayerMatchKey)),
        focusPlayerMatchKey
      ),
      description: "",
      eventId: sourceEvent.id,
    });
  }

  const rootSent = markFocused(
    sides.sent.map((a) => toAsset(a, nameToId, focusPlayerMatchKey)),
    focusPlayerMatchKey
  );
  const visited = new Set(sides.sent.map((s) => s.matchKey));
  const ctx = buildWalkContext(index.events);

  const root = walkBranch({
    focusTeamId: teamId,
    haul: sides.got,
    date: sourceEvent.date,
    eventId: sourceEvent.id,
    description: sourceEvent.description,
    via: null,
    depth: 0,
    visited,
    ctx,
    nameToId,
    focusMatchKey: focusPlayerMatchKey,
    direction: "forward",
  });

  const ancestry: TradeTreeNode[] = [];
  for (const sent of sides.sent.filter(
    (a) => a.kind === "player" || a.kind === "pick"
  )) {
    const prior = findPriorAcquisition(
      toAsset(sent, nameToId),
      teamId,
      sourceEvent.date,
      ctx
    );
    if (!prior.event) {
      ancestry.push({
        id: `ancestry-open:${sent.matchKey}`,
        teamId,
        teamAbbr: brandAbbr(teamId),
        date: "",
        eventId: "",
        description: "",
        assets: markFocused(
          [toAsset(sent, nameToId, focusPlayerMatchKey)],
          focusPlayerMatchKey
        ),
        via: prior.disposition,
        children: [
          {
            fromAssetId: `player:${sent.matchKey}`,
            fromAssetLabel: sent.label,
            disposition: prior.disposition,
            node: null,
          },
        ],
      });
      continue;
    }

    const node = walkBranch({
      focusTeamId: teamId,
      haul: prior.priorHaul.length ? prior.priorHaul : [sent],
      date: prior.event.date,
      eventId: prior.event.id,
      description: prior.event.description,
      via: prior.disposition,
      depth: 0,
      visited: new Set([sent.matchKey]),
      ctx,
      nameToId,
      focusMatchKey: focusPlayerMatchKey,
      direction: "backward",
    });
    if (!node.assets.some((a) => a.matchKey === sent.matchKey)) {
      node.assets = [
        ...markFocused(
          [toAsset(sent, nameToId, focusPlayerMatchKey)],
          focusPlayerMatchKey
        ),
        ...node.assets,
      ];
    }
    ancestry.push(node);
  }

  const ancestryDepth = ancestry.reduce((m, n) => Math.max(m, maxDepth(n)), 0);
  const headline =
    focusPlayerLabel ??
    rootSent.find((a) => a.kind === "player")?.label ??
    sides.got.find((a) => a.kind === "player")?.label ??
    brandAbbr(teamId);

  return {
    teamId,
    teamAbbr: brand?.abbr ?? teamId,
    teamName: brandName(teamId),
    rootEventId: sourceEvent.id,
    title: focusPlayerLabel
      ? `How ${brandAbbr(teamId)} got ${focusPlayerLabel}`
      : `The ${headline} trade tree · ${brandAbbr(teamId)}`,
    rootDate: sourceEvent.date,
    focusPlayerMatchKey,
    focusPlayerLabel,
    rootSent,
    rootCounterparties: counterparties,
    ancestry,
    root,
    rootOptions: [],
    playerCatalog,
    depth: maxDepth(root),
    branchCount: countBranches(root),
    ancestryDepth,
    disclaimer:
      "Full forward + backward genealogy from ESPN free-text blurbs. Open leaves mean the archive has no further move — not a verified ownership ledger.",
  };
}
