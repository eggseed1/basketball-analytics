import { espnFetchJson } from "@/data/providers/nba/espn-client";
import { jsonError, jsonOk } from "@/app/api/_lib/http";
import { searchLocalTeamIdentities, teamIdentityQueryMatches } from "@/data/identity/team-search";
import { getPlayerIdAliasIndex } from "@/data/identity/player-identity";
import { isProductionApprovedPlayerAlias } from "@/data/providers/impact/player-id-aliases";

const SITE_WEB = "https://site.web.api.espn.com";

type EspnSearchTeamCore = {
  id?: string;
  abbreviation?: string;
  displayName?: string;
  shortDisplayName?: string;
};

type EspnSearchItem = {
  id?: string;
  displayName?: string;
  shortName?: string;
  type?: string;
  abbreviation?: string;
  location?: string;
  name?: string;
  teamRelationships?: Array<{
    type?: string;
    displayName?: string;
    core?: EspnSearchTeamCore;
  }>;
};

type EspnSearchResponse = {
  items?: EspnSearchItem[];
};

export type WatchlistSearchHit = {
  id: string;
  name: string;
  kind: "player" | "team";
  teamKey?: string;
  subtitle?: string;
  href?: string;
};

function playerTeamFromItem(item: EspnSearchItem): {
  teamKey?: string;
  teamName?: string;
} {
  const rel =
    item.teamRelationships?.find((r) => r.type === "team") ??
    item.teamRelationships?.[0];
  const core = rel?.core;
  const abbr = core?.abbreviation?.trim();
  const id = core?.id != null ? String(core.id) : undefined;
  return {
    teamKey: abbr || id,
    teamName:
      core?.displayName ||
      rel?.displayName ||
      core?.shortDisplayName ||
      undefined,
  };
}

/**
 * Search NBA players and teams via ESPN common search,
 * plus local historical team / franchise identity documents.
 * GET /api/search?q=curry&kind=player|team|all
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const kindRaw = (searchParams.get("kind") ?? "all").toLowerCase();
    const kind =
      kindRaw === "player" || kindRaw === "team" ? kindRaw : "all";

    if (q.length < 2) {
      return jsonOk({ query: q, count: 0, data: [] as WatchlistSearchHit[] });
    }

    const hits: WatchlistSearchHit[] = [];
    const seen = new Set<string>();
    const seenPlayerNames = new Set<string>();
    const aliasIndex =
      kind === "all" || kind === "player"
        ? await getPlayerIdAliasIndex()
        : null;

    if (kind === "all" || kind === "team") {
      for (const local of searchLocalTeamIdentities(q, 10)) {
        const key = `${local.kind}:${local.href}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({
          id: local.id,
          name: local.name,
          kind: "team",
          teamKey: local.teamKey,
          subtitle: local.subtitle,
          href: local.href,
        });
      }
    }

    const types =
      kind === "all"
        ? (["player", "team"] as const)
        : kind === "player"
          ? (["player"] as const)
          : (["team"] as const);

    const payloads = await Promise.all(
      types.map((type) => {
        const url =
          `${SITE_WEB}/apis/common/v3/search` +
          `?query=${encodeURIComponent(q)}` +
          `&limit=12&type=${type}&sport=basketball&league=nba`;
        return espnFetchJson<EspnSearchResponse>(url, {
          ttlMs: 1000 * 60 * 5,
          retries: 1,
        }).catch(() => ({ items: [] }) as EspnSearchResponse);
      })
    );

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

        if (itemKind === "team") {
          const abbr = item.abbreviation?.toLowerCase();
          if (
            !teamIdentityQueryMatches(
              [
                item.displayName,
                item.shortName,
                item.abbreviation,
                item.location,
                item.name,
              ],
              q
            )
          ) {
            continue;
          }
          const key = `${itemKind}:${item.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push({
            id: String(item.id),
            name: item.displayName,
            kind: "team",
            teamKey: abbr,
            subtitle: item.abbreviation ?? undefined,
            href: `/teams/${encodeURIComponent(String(item.id))}`,
          });
          continue;
        }

        const espnId = String(item.id);
        const alias = aliasIndex?.byEspn.get(espnId);
        const canonicalId =
          alias && isProductionApprovedPlayerAlias(alias)
            ? alias.nbaPlayerId
            : espnId;
        const nameKey = item.displayName.trim().toLowerCase().replace(/\s+/g, " ");
        const key = `${itemKind}:${canonicalId}`;
        if (seen.has(key)) continue;
        if (nameKey && seenPlayerNames.has(nameKey)) continue;
        seen.add(key);
        if (nameKey) seenPlayerNames.add(nameKey);

        const { teamKey, teamName } = playerTeamFromItem(item);
        hits.push({
          id: canonicalId,
          name: item.displayName,
          kind: "player",
          teamKey,
          subtitle: teamName ?? item.shortName ?? "Player",
        });
      }
    }

    return jsonOk({ query: q, count: hits.length, data: hits });
  } catch (error) {
    return jsonError(error);
  }
}
