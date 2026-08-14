import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { resolveTeamBrand } from "@/lib/nba-brand";
import { normalizePlayerName } from "@/lib/player-name";
import type { BasketballQueryAst, QueryEntity } from "./types";

const SITE_WEB = "https://site.web.api.espn.com";

export type EntityHit = {
  id: string;
  name: string;
  kind: "player" | "team";
  subtitle?: string;
};

type EspnSearchItem = {
  id?: string;
  displayName?: string;
  shortName?: string;
  type?: string;
  abbreviation?: string;
  teamRelationships?: Array<{
    type?: string;
    displayName?: string;
    core?: { id?: string; abbreviation?: string; displayName?: string };
  }>;
};

type EspnSearchResponse = { items?: EspnSearchItem[] };

/** Deterministic aliases for tests + common queries (ESPN ids). */
export const PLAYER_ALIASES: Record<string, { id: string; name: string }> = {
  lebron: { id: "1966", name: "LeBron James" },
  "lebron james": { id: "1966", name: "LeBron James" },
  kingjames: { id: "1966", name: "LeBron James" },
  jokic: { id: "3112335", name: "Nikola Jokic" },
  "nikola jokic": { id: "3112335", name: "Nikola Jokic" },
  curry: { id: "3975", name: "Stephen Curry" },
  "stephen curry": { id: "3975", name: "Stephen Curry" },
  "steph curry": { id: "3975", name: "Stephen Curry" },
  giannis: { id: "3032977", name: "Giannis Antetokounmpo" },
  tatum: { id: "4065648", name: "Jayson Tatum" },
  "jayson tatum": { id: "4065648", name: "Jayson Tatum" },
  "trey murphy": { id: "4395725", name: "Trey Murphy III" },
  "trey murphy iii": { id: "4395725", name: "Trey Murphy III" },
};

export function resolveTeamFromText(text: string): EntityHit | null {
  const cityNick: Array<{ re: RegExp; id: string }> = [
    { re: /\b(boston|celtics)\b/i, id: "bos" },
    { re: /\b(oklahoma\s+city|thunder|okc)\b/i, id: "okc" },
    { re: /\b(denver|nuggets)\b/i, id: "den" },
    { re: /\b(golden\s+state|warriors|gsw)\b/i, id: "gs" },
    { re: /\b(los\s+angeles\s+lakers|lakers)\b/i, id: "lal" },
    { re: /\b(los\s+angeles\s+clippers|clippers|lac)\b/i, id: "lac" },
    { re: /\b(new\s+york|knicks|nyk)\b/i, id: "ny" },
    { re: /\b(brooklyn|nets|bkn)\b/i, id: "bkn" },
    { re: /\b(miami|heat)\b/i, id: "mia" },
    { re: /\b(milwaukee|bucks)\b/i, id: "mil" },
    { re: /\b(phoenix|suns)\b/i, id: "phx" },
    { re: /\b(dallas|mavericks|mavs)\b/i, id: "dal" },
    { re: /\b(cleveland|cavaliers|cavs)\b/i, id: "cle" },
    { re: /\b(chicago|bulls)\b/i, id: "chi" },
    { re: /\b(philadelphia|76ers|sixers)\b/i, id: "phi" },
    { re: /\b(minnesota|timberwolves|wolves)\b/i, id: "min" },
    { re: /\b(memphis|grizzlies)\b/i, id: "mem" },
    { re: /\b(sacramento|kings)\b/i, id: "sac" },
    { re: /\b(toronto|raptors)\b/i, id: "tor" },
    { re: /\b(atlanta|hawks)\b/i, id: "atl" },
    { re: /\b(charlotte|hornets)\b/i, id: "cha" },
    { re: /\b(detroit|pistons)\b/i, id: "det" },
    { re: /\b(indiana|pacers)\b/i, id: "ind" },
    { re: /\b(orlando|magic)\b/i, id: "orl" },
    { re: /\b(washington|wizards)\b/i, id: "wsh" },
    { re: /\b(houston|rockets)\b/i, id: "hou" },
    { re: /\b(san\s+antonio|spurs)\b/i, id: "sa" },
    { re: /\b(utah|jazz)\b/i, id: "utah" },
    { re: /\b(portland|trail\s+blazers|blazers)\b/i, id: "por" },
    { re: /\b(new\s+orleans|pelicans)\b/i, id: "no" },
  ];

  for (const row of cityNick) {
    if (row.re.test(text)) {
      const brand = resolveTeamBrand(row.id);
      if (!brand) continue;
      return {
        id: brand.espnTeamId,
        name: `${brand.abbr}`,
        kind: "team",
        subtitle: brand.abbr,
      };
    }
  }

  // bare abbr
  const abbrHit = /\b([A-Z]{2,3})\b/.exec(text);
  if (abbrHit) {
    const brand = resolveTeamBrand(abbrHit[1]);
    if (brand) {
      return {
        id: brand.espnTeamId,
        name: brand.abbr,
        kind: "team",
        subtitle: brand.abbr,
      };
    }
  }

  return null;
}

export async function searchNbaEntities(
  q: string,
  kind: "player" | "team" | "all" = "all"
): Promise<EntityHit[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const types =
    kind === "all" ? (["player", "team"] as const) : ([kind] as const);

  const payloads = await Promise.all(
    types.map((type) => {
      const url =
        `${SITE_WEB}/apis/common/v3/search` +
        `?query=${encodeURIComponent(trimmed)}` +
        `&limit=8&type=${type}&sport=basketball&league=nba`;
      return espnFetchJson<EspnSearchResponse>(url, {
        ttlMs: 1000 * 60 * 5,
        retries: 1,
      }).catch(() => ({ items: [] }) as EspnSearchResponse);
    })
  );

  const hits: EntityHit[] = [];
  const seen = new Set<string>();
  for (const payload of payloads) {
    for (const item of payload.items ?? []) {
      if (!item.id || !item.displayName) continue;
      const itemKind =
        item.type === "team"
          ? "team"
          : item.type === "player"
            ? "player"
            : null;
      if (!itemKind) continue;
      if (kind !== "all" && itemKind !== kind) continue;
      const key = `${itemKind}:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        id: String(item.id),
        name: item.displayName,
        kind: itemKind,
        subtitle:
          itemKind === "team"
            ? item.abbreviation
            : item.shortName ?? undefined,
      });
    }
  }
  return hits;
}

export async function resolvePlayerQuery(
  nameHint: string
): Promise<{ hit?: EntityHit; ambiguous?: EntityHit[] }> {
  const key = nameHint.toLowerCase().trim();
  const alias = PLAYER_ALIASES[key] ?? PLAYER_ALIASES[normalizePlayerName(nameHint)];
  // Also try stripped possessive
  const stripped = key.replace(/'s\b/g, "").trim();
  const alias2 = PLAYER_ALIASES[stripped];

  if (alias || alias2) {
    const a = alias ?? alias2!;
    return { hit: { id: a.id, name: a.name, kind: "player" } };
  }

  const hits = await searchNbaEntities(nameHint.replace(/'s\b/gi, "").trim(), "player");
  if (!hits.length) return {};
  if (hits.length === 1) return { hit: hits[0] };

  // Prefer exact / starts-with name matches
  const norm = normalizePlayerName(nameHint);
  const exact = hits.filter(
    (h) =>
      normalizePlayerName(h.name) === norm ||
      normalizePlayerName(h.name).startsWith(norm)
  );
  if (exact.length === 1) return { hit: exact[0] };
  if (exact.length > 1) return { ambiguous: exact.slice(0, 6) };
  return { ambiguous: hits.slice(0, 6) };
}

/**
 * Fill empty entity ids from name hints; record ambiguity on the AST.
 */
export async function resolveQueryEntities(
  ast: BasketballQueryAst
): Promise<BasketballQueryAst> {
  const next: BasketballQueryAst = {
    ...ast,
    entities: [...ast.entities],
    ambiguous: ast.ambiguous ? [...ast.ambiguous] : undefined,
  };

  const entities: QueryEntity[] = [];
  for (const ent of next.entities) {
    if (ent.kind === "lineup") {
      entities.push(ent);
      continue;
    }
    if (ent.id) {
      entities.push(ent);
      continue;
    }
    if (ent.kind === "team") {
      const local =
        (ent.name && resolveTeamFromText(ent.name)) ||
        (ast.rawQuery ? resolveTeamFromText(ast.rawQuery) : null);
      if (local) {
        entities.push({
          kind: "team",
          id: local.id,
          name: local.name,
        });
        continue;
      }
      const hits = await searchNbaEntities(ent.name ?? "", "team");
      if (hits.length === 1) {
        entities.push({ kind: "team", id: hits[0]!.id, name: hits[0]!.name });
      } else if (hits.length > 1) {
        next.ambiguous = next.ambiguous ?? [];
        next.ambiguous.push({
          kind: "team",
          query: ent.name ?? "",
          candidates: hits.map((h) => ({
            id: h.id,
            name: h.name,
            subtitle: h.subtitle,
          })),
        });
        entities.push(ent);
      } else {
        entities.push(ent);
      }
      continue;
    }

    // player
    const resolved = await resolvePlayerQuery(ent.name ?? "");
    if (resolved.hit) {
      entities.push({
        kind: "player",
        id: resolved.hit.id,
        name: resolved.hit.name,
      });
    } else if (resolved.ambiguous?.length) {
      next.ambiguous = next.ambiguous ?? [];
      next.ambiguous.push({
        kind: "player",
        query: ent.name ?? "",
        candidates: resolved.ambiguous.map((h) => ({
          id: h.id,
          name: h.name,
          subtitle: h.subtitle,
        })),
      });
      entities.push(ent);
    } else {
      entities.push(ent);
    }
  }

  next.entities = entities;
  return next;
}
