/**
 * Drafted players with no NBA minutes yet, so search can find them before
 * their first game. The search index only lists players with box-score rows.
 *
 * Picks come from the full draft history plus the nightly draft-night bake,
 * which covers a new class before the history catches up. History picks carry
 * NBA ids; most of the site routes by ESPN id. A pick takes the ESPN id the
 * draft-night bake links, else the one baked bio with the same name and a
 * birth year that fits the draft, else keeps its NBA id (both route to a page).
 */
import { bundledDraftPicks, type BundledDraftPick } from "./draft-history-snapshot";
import { draftNightPicks } from "./draft-night-snapshot";
import { bundledPlayerBioEntries } from "./player-bio-snapshot";
import { getBundledPlayerIdAliasIndex } from "./player-id-aliases-snapshot";
import { getPlayerSearchIndex } from "./player-search-snapshot";
import { normalizePlayerName } from "@/lib/player-name";

export type UnplayedDraftee = BundledDraftPick & {
  /** Route id: ESPN when matched, else the NBA id. */
  id: string;
  position: string | null;
};

/** Draft-age window for trusting a name-only bio match. */
const MIN_DRAFT_AGE = 17;
const MAX_DRAFT_AGE = 27;
/** A same-name debut this many years after the draft still counts as him (stash players). */
const MAX_DEBUT_LAG = 8;

let cached: UnplayedDraftee[] | null = null;

function startYear(season: string | undefined): number | null {
  const y = Number.parseInt(String(season ?? ""), 10);
  return Number.isFinite(y) ? y : null;
}

export function unplayedDraftees(): UnplayedDraftee[] {
  if (cached) return cached;
  const index = getPlayerSearchIndex();
  const indexIds = new Set(index.map((row) => row.id));
  const debutsByName = new Map<string, number[]>();
  for (const row of index) {
    const y = startYear(row.firstSeason || row.season);
    if (y == null) continue;
    const key = normalizePlayerName(row.name);
    debutsByName.set(key, [...(debutsByName.get(key) ?? []), y]);
  }

  const biosByName = new Map<string, ReturnType<typeof bundledPlayerBioEntries>>();
  for (const bio of bundledPlayerBioEntries()) {
    if (bio.id.startsWith("bref:")) continue;
    const key = normalizePlayerName(bio.name);
    biosByName.set(key, [...(biosByName.get(key) ?? []), bio]);
  }
  const aliases = getBundledPlayerIdAliasIndex();

  const night = new Map(draftNightPicks().map((p) => [`${p.year}:${p.overall}`, p]));
  const picks: Array<BundledDraftPick & { linkedId?: string; position?: string | null }> = [];
  const seenSlots = new Set<string>();
  for (const pick of bundledDraftPicks()) {
    const slot = `${pick.year}:${pick.overall}`;
    seenSlots.add(slot);
    // One player per slot; names can differ by a suffix ("Labaron Philon Jr.").
    const n = night.get(slot);
    picks.push(
      n ? { ...pick, name: n.name, position: n.position, ...(n.playerId ? { linkedId: n.playerId } : {}) } : pick
    );
  }
  for (const [slot, n] of night) {
    if (seenSlots.has(slot)) continue;
    picks.push({
      nbaId: "",
      name: n.name,
      year: n.year,
      round: n.round,
      roundPick: n.roundPick,
      overall: n.overall,
      teamAbbr: n.teamAbbr,
      ...(n.playerId ? { linkedId: n.playerId } : {}),
      position: n.position,
    });
  }

  const out: UnplayedDraftee[] = [];
  for (const pick of picks) {
    const key = normalizePlayerName(pick.name);
    const fits = (biosByName.get(key) ?? []).filter((bio) => {
      if (bio.id === pick.nbaId) return false;
      const born = startYear(bio.birthDate);
      return born != null && pick.year - born >= MIN_DRAFT_AGE && pick.year - born <= MAX_DRAFT_AGE;
    });
    const bio = fits.length === 1 ? fits[0] : undefined;
    const espnId =
      pick.linkedId ?? (pick.nbaId ? aliases.byNba.get(pick.nbaId)?.espnPlayerId : undefined) ?? bio?.id;
    const routeId = espnId ?? pick.nbaId;
    if (!routeId) continue;
    if ((pick.nbaId && indexIds.has(pick.nbaId)) || (espnId && indexIds.has(espnId))) continue;
    if ((debutsByName.get(key) ?? []).some((y) => y >= pick.year && y <= pick.year + MAX_DEBUT_LAG)) {
      continue;
    }
    const { linkedId: _linked, position, ...rest } = pick;
    void _linked;
    out.push({ ...rest, id: routeId, position: position ?? bio?.position ?? null });
  }
  cached = out;
  return out;
}
