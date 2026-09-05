/**
 * Parse ESPN free-text trade blurbs into sent/got asset bags.
 * Heuristic only — not a structured ownership ledger.
 */

import { extractTransactionPlayerMentions } from "@/lib/transaction-player-extract";
import { normalizePlayerName } from "@/lib/player-name";
import { ESPN_TEAM_META } from "@/data/providers/nba/team-meta";
import { resolveTeamBrand, TEAM_BRANDS } from "@/lib/nba-brand";

export type ParsedTradeAssetKind = "player" | "pick" | "cash" | "other";

export type ParsedTradeAsset = {
  kind: ParsedTradeAssetKind;
  label: string;
  /** Normalized key for matching later blurbs. */
  matchKey: string;
  positionHint?: string | null;
};

export type ParsedTradeSides = {
  sent: ParsedTradeAsset[];
  got: ParsedTradeAsset[];
  counterpartyHint: string | null;
  /** Which parse pattern matched. */
  pattern:
    | "traded_to_for"
    | "acquired_in_exchange"
    | "acquired_for"
    | "acquired_from"
    | "fallback"
    | null;
};

function uniqAssets(assets: ParsedTradeAsset[]): ParsedTradeAsset[] {
  const seen = new Set<string>();
  const out: ParsedTradeAsset[] = [];
  for (const a of assets) {
    const k = `${a.kind}:${a.matchKey}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

const POSITION_PREFIX_RE =
  /^(?:Gs|Fs|Cs|F-C|G-F|F-G|PG|SG|SF|PF|G|F|C)\s+/i;

const TRANSACTION_VERB_PREFIX_RE =
  /^(?:Acquired|Acquire|Traded|Waived|Signed|Released|Claimed|Sent)\s+/i;

/** ESPN blurbs use both "Acquire" and "Acquired". */
const ACQUIRE_VERB = "(?:Acquired|Acquire)";

function stripPositionPrefix(label: string): string {
  return label.replace(POSITION_PREFIX_RE, "").trim();
}

function cleanPlayerLabel(label: string): string {
  let s = label.trim();
  for (let i = 0; i < 3; i++) {
    const next = s.replace(TRANSACTION_VERB_PREFIX_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return stripPositionPrefix(s).replace(/[.,;:]+$/g, "").trim();
}

function playerCoreKey(label: string): string {
  return normalizePlayerName(stripPositionPrefix(label));
}

/** Drop "F-C Kevin Garnett" when "Kevin Garnett" is already extracted. */
function collapsePlayerDuplicates(
  assets: ParsedTradeAsset[]
): ParsedTradeAsset[] {
  const players = assets.filter((a) => a.kind === "player");
  const rest = assets.filter((a) => a.kind !== "player");
  const byCore = new Map<string, ParsedTradeAsset>();

  for (const asset of players) {
    const cleaned = cleanPlayerLabel(asset.label);
    if (!cleaned || isNoiseName(cleaned)) continue;
    const core = playerCoreKey(cleaned);
    if (!core || core.length < 4) continue;
    const normalized = {
      ...asset,
      label: cleaned,
      matchKey: core,
    };
    const existing = byCore.get(core);
    if (!existing) {
      byCore.set(core, normalized);
      continue;
    }
    const existingPrefixed = POSITION_PREFIX_RE.test(existing.label);
    const nextPrefixed = POSITION_PREFIX_RE.test(asset.label);
    if (existingPrefixed && !nextPrefixed) {
      byCore.set(core, normalized);
    }
  }

  return uniqAssets([...byCore.values(), ...rest]);
}

function playersFromText(text: string): ParsedTradeAsset[] {
  const fromExtract = extractTransactionPlayerMentions(text).map((m) => ({
    kind: "player" as const,
    label: m.rawName,
    matchKey: m.normalizedName,
    positionHint: m.positionHint,
  }));

  const known = new Set(fromExtract.map((a) => a.matchKey));
  const bare: ParsedTradeAsset[] = [];
  const bareRe = new RegExp(
    `\\b(${PLAYER_NAME_BARE})(?=\\s*(?:,|and|from|for|in|to|;|\\.|$))`,
    "g"
  );
  for (const m of text.matchAll(bareRe)) {
    let label = m[1]!.replace(/\s+/g, " ").trim();
    if (TRANSACTION_VERB_PREFIX_RE.test(label)) {
      label = cleanPlayerLabel(label);
    } else {
      label = stripPositionPrefix(label);
    }
    if (!label || isNoiseName(label)) continue;
    const matchKey = normalizePlayerName(label);
    if (known.has(matchKey)) continue;
    known.add(matchKey);
    bare.push({
      kind: "player",
      label,
      matchKey,
      positionHint: null,
    });
  }

  return collapsePlayerDuplicates([...fromExtract, ...bare]);
}

const PLAYER_NAME_BARE =
  "[A-Z][A-Za-z'.-]*(?:-[A-Z][A-Za-z'.-]*)*(?:\\s+[A-Z][A-Za-z'.-]*(?:-[A-Z][A-Za-z'.-]*)*){0,3}(?:\\s+(?:Jr\\.?|Sr\\.?|II|III|IV|V))?";

function isNoiseName(name: string): boolean {
  const n = normalizePlayerName(name);
  if (n.length < 5) return true;
  if (
    /^(the|and|for|from|with|into|over|into|first|second|round|draft|pick|picks|future|protected|swap|swaps|considerations|cash|exception|trade|rights|option|options|contract|year|years|million)$/i.test(
      name
    )
  ) {
    return true;
  }
  // Team-ish tokens
  if (
    /celtics|nets|lakers|cavs|cavaliers|suns|knicks|nuggets|rockets|bucks|jazz|warriors|spurs|heat|bulls|hawks|hornets|pistons|pacers|magic|sixers|76ers|thunder|timberwolves|wolves|blazers|kings|mavericks|mavs|pelicans|grizzlies|wizards|raptors|clippers|brooklyn|boston|cleveland|phoenix|denver|houston|milwaukee|utah|new york|los angeles|golden state|san antonio|oklahoma|minnesota|portland|sacramento|dallas|new orleans|memphis|washington|toronto|atlanta|charlotte|chicago|detroit|indiana|orlando|philadelphia|miami|milwaukee/i.test(
      name
    )
  ) {
    return true;
  }
  return false;
}

function picksFromText(text: string): ParsedTradeAsset[] {
  const out: ParsedTradeAsset[] = [];
  const patterns: Array<{ re: RegExp; kind: ParsedTradeAssetKind }> = [
    {
      re: /\b(?:a |an |\d+|four|three|two|one)?\s*(?:future )?(?:protected )?(?:\d{4} )?(?:[A-Z]{2,3} )?(?:first|second|1st|2nd)[\w'-]*(?:\s+round)?(?:\s+draft)?\s*picks?\b/gi,
      kind: "pick",
    },
    { re: /\bpick swaps?\b/gi, kind: "pick" },
    { re: /\bdraft considerations?\b/gi, kind: "pick" },
    {
      re: /\b(?:\d{4}\s+)?(?:[A-Z]{2,3}\s+)?(?:1st|2nd)(?:\s+round)?(?:\s+picks?)?\b/gi,
      kind: "pick",
    },
    {
      re: /\$[\d.]+(?:\s*million)?(?:\s+trade exception)?/gi,
      kind: "cash",
    },
    { re: /\bcash considerations?\b/gi, kind: "cash" },
    { re: /\bTPE\b|\btrade exception\b/gi, kind: "cash" },
  ];
  for (const { re, kind } of patterns) {
    for (const m of text.matchAll(re)) {
      const label = m[0]!.replace(/\s+/g, " ").trim();
      if (label.length < 3) continue;
      out.push({
        kind,
        label,
        matchKey: normalizePlayerName(label),
      });
    }
  }
  return out;
}

function assetsFromText(text: string): ParsedTradeAsset[] {
  if (!text?.trim()) return [];
  return collapsePlayerDuplicates([
    ...playersFromText(text),
    ...picksFromText(text),
  ]);
}

function teamAliases(teamId: string): string[] {
  const brand = resolveTeamBrand(teamId);
  const meta = ESPN_TEAM_META[teamId];
  const out = new Set<string>();
  if (brand?.abbr) out.add(brand.abbr.toLowerCase());
  if (meta?.city) out.add(meta.city.toLowerCase());
  for (const b of Object.values(TEAM_BRANDS)) {
    if (b.espnTeamId === teamId) out.add(b.abbr.toLowerCase());
  }
  const nickById: Record<string, string[]> = {
    "2": ["celtics", "boston celtics"],
    "5": ["cavaliers", "cavs", "cleveland cavaliers"],
    "17": ["nets", "brooklyn nets"],
    "21": ["suns", "phoenix suns"],
    "18": ["knicks", "new york knicks"],
    "7": ["nuggets", "denver nuggets"],
    "10": ["rockets", "houston rockets"],
    "13": ["lakers", "la lakers", "los angeles lakers"],
    "26": ["jazz", "utah jazz"],
    "15": ["bucks", "milwaukee bucks"],
  };
  for (const n of nickById[teamId] ?? []) out.add(n);
  return [...out].sort((a, b) => b.length - a.length);
}

function detectCounterparty(text: string): string | null {
  const lower = text.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const id of Object.keys(ESPN_TEAM_META)) {
    for (const alias of teamAliases(id)) {
      if (alias.length < 3) continue;
      if (lower.includes(alias) && (!best || alias.length > best.len)) {
        best = { id, len: alias.length };
      }
    }
  }
  if (!best) return null;
  return resolveTeamBrand(best.id)?.abbr ?? best.id;
}

function lastMatch(text: string, re: RegExp): RegExpMatchArray | null {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  let last: RegExpMatchArray | null = null;
  for (const m of text.matchAll(global)) last = m;
  return last;
}

/**
 * Parse a single ESPN trade-ish blurb into sent/got from the posting team's POV.
 */
export function parseTradeSides(description: string): ParsedTradeSides {
  const d = description.replace(/\s+/g, " ").trim();
  if (!d) {
    return { sent: [], got: [], counterpartyHint: null, pattern: null };
  }

  {
    const m = d.match(
      /(?:^|[.]\s*)Traded\s+(.+?)\s+to\s+(?:the\s+)?(.+?)\s+for\s+(.+?)(?:\.|$)/i
    );
    if (m) {
      return {
        sent: assetsFromText(m[1]!),
        got: assetsFromText(m[3]!),
        counterpartyHint: detectCounterparty(m[2]!) ?? detectCounterparty(d),
        pattern: "traded_to_for",
      };
    }
  }

  {
    const m = lastMatch(
      d,
      new RegExp(
        `${ACQUIRE_VERB}\\s+(.+?)\\s+from\\s+([^,.]+?)\\s+in exchange for\\s+(.+?)(?:\\.|$)`,
        "i"
      )
    );
    if (m) {
      return {
        got: assetsFromText(m[1]!),
        sent: assetsFromText(m[3]!),
        counterpartyHint:
          detectCounterparty(m[2]!) ?? detectCounterparty(d),
        pattern: "acquired_in_exchange",
      };
    }
  }

  {
    const m = lastMatch(
      d,
      new RegExp(
        `${ACQUIRE_VERB}\\s+(.+?)\\s+from\\s+([^,.]+?)\\s+for\\s+(.+?)(?:\\.|$)`,
        "i"
      )
    );
    if (m && !/in exchange for/i.test(d)) {
      return {
        got: assetsFromText(m[1]!),
        sent: assetsFromText(m[3]!),
        counterpartyHint:
          detectCounterparty(m[2]!) ?? detectCounterparty(d),
        pattern: "acquired_for",
      };
    }
  }

  {
    const m = d.match(
      new RegExp(
        `${ACQUIRE_VERB}\\s+(.+?)\\s+in a sign-and-trade deal with\\s+(.+?)\\s+for\\s+(.+?)(?:\\.|$)`,
        "i"
      )
    );
    if (m) {
      return {
        got: assetsFromText(m[1]!),
        sent: assetsFromText(m[3]!),
        counterpartyHint:
          detectCounterparty(m[2]!) ?? detectCounterparty(d),
        pattern: "acquired_for",
      };
    }
  }

  {
    const m = lastMatch(
      d,
      new RegExp(
        `${ACQUIRE_VERB}\\s+(.+?)\\s+from\\s+([^,.]+?)(?:\\s*[,.]|$)`,
        "i"
      )
    );
    if (m) {
      return {
        got: assetsFromText(m[1]!),
        sent: [],
        counterpartyHint:
          detectCounterparty(m[2]!) ?? detectCounterparty(d),
        pattern: "acquired_from",
      };
    }
  }

  const looksInbound =
    /\bacquire[ds]?\b|\bin exchange for\b|\breceived\b/i.test(d);
  const all = assetsFromText(d);
  return {
    got: looksInbound ? all : [],
    sent: looksInbound ? [] : all,
    counterpartyHint: detectCounterparty(d),
    pattern: "fallback",
  };
}

/** Flip a partner team's blurb into focus-team POV. */
export function flipTradeSides(sides: ParsedTradeSides): ParsedTradeSides {
  return {
    sent: sides.got,
    got: sides.sent,
    counterpartyHint: sides.counterpartyHint,
    pattern: sides.pattern,
  };
}

export function descriptionMentionsAsset(
  description: string,
  asset: ParsedTradeAsset
): boolean {
  if (!asset.matchKey || asset.matchKey.length < 4) return false;
  const hay = normalizePlayerName(description);
  if (hay.includes(asset.matchKey)) return true;

  const parts = asset.label.trim().split(/\s+/);
  if (parts.length < 2) return false;
  const last = normalizePlayerName(parts[parts.length - 1]!);
  const first = normalizePlayerName(parts[0]!);
  if (last.length < 5 || !hay.includes(last)) return false;
  if (hay.includes(first)) return true;
  // Cam / Cameron style prefixes
  if (first.length >= 3 && hay.includes(first.slice(0, 3))) return true;
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tradeAssetsMatch(a: ParsedTradeAsset, b: ParsedTradeAsset): boolean {
  return (
    a.kind === b.kind &&
    (a.matchKey === b.matchKey ||
      descriptionMentionsAsset(a.label, b) ||
      descriptionMentionsAsset(b.label, a))
  );
}

/**
 * True when the posting team's parse of a trade blurb shows this asset
 * leaving the team (sent/waived/released) — never on pure inbound acquire.
 */
export function assetOutboundInEvent(
  description: string,
  asset: ParsedTradeAsset
): boolean {
  if (asset.kind === "player") {
    if (!descriptionMentionsAsset(description, asset)) return false;
    const name = asset.label.toLowerCase();
    if (
      new RegExp(`\\b(?:waived|released)\\b[^.]*${escapeRe(name)}`, "i").test(
        description
      )
    ) {
      return true;
    }
    if (
      new RegExp(`${escapeRe(name)}[^.]*\\b(?:waived|released)\\b`, "i").test(
        description
      )
    ) {
      return true;
    }
  } else if (asset.kind === "pick") {
    const year = asset.label.match(/\b(19|20)\d{2}\b/)?.[0];
    const hay = normalizePlayerName(description);
    if (!year && asset.matchKey.length < 6) return false;
    if (year && !hay.includes(year)) return false;
    if (!/\bpick\b|\bdraft\b/i.test(description)) return false;
  } else {
    return false;
  }

  const sides = parseTradeSides(description);
  return sides.sent.some((s) => tradeAssetsMatch(s, asset));
}

export function looksLikeOutboundOfAsset(
  description: string,
  asset: ParsedTradeAsset
): boolean {
  return assetOutboundInEvent(description, asset);
}

export function isTradeLikeEvent(
  category: string,
  description: string
): boolean {
  if (category === "trade") return true;
  return (
    /\btraded\b|\bacquired\b.+\b(?:from|in exchange for)\b|\bin exchange for\b/i.test(
      description
    ) && !/\bwaived\b.+\bsigned\b/i.test(description)
  );
}
