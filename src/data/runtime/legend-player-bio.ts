/**
 * Player bio from the baked BRef legend careers, for players whose NBA/ESPN
 * profiles are unreachable (Workers) or missing (pre-1997 careers).
 */
import { parseBrefPlayerSlug } from "@/data/providers/nba/bref-career-from-page";
import type { BrefPlayerBio } from "@/data/providers/nba/bref-player-page";
import { loadBundledBrefCareer } from "@/data/runtime/legend-careers-store";
import { remapLegendNbaIdToBref } from "@/data/runtime/legend-nba-to-bref";
import type { Player, Position } from "@/data/types";

const BREF_POSITION: Record<string, Position> = {
  "point guard": "PG",
  "shooting guard": "SG",
  "small forward": "SF",
  "power forward": "PF",
  center: "C",
};

function playerFromBrefBio(id: string, bio: BrefPlayerBio): Player {
  const parts = bio.displayName.trim().split(/\s+/);
  const firstPosition = bio.positionLine
    ?.split(/\s+and\s+|,/i)[0]
    ?.trim()
    .toLowerCase();
  const draft = bio.draftLine ?? "";
  const round = /(\d+)(?:st|nd|rd|th) round/i.exec(draft)?.[1];
  const pick = /\((\d+)(?:st|nd|rd|th) pick/i.exec(draft)?.[1];
  const draftYear = /(\d{4}) (?:NBA|BAA) Draft/i.exec(draft)?.[1];
  return {
    id,
    fullName: bio.displayName,
    firstName: parts[0] ?? bio.displayName,
    lastName: parts.slice(1).join(" "),
    position: firstPosition ? BREF_POSITION[firstPosition] : undefined,
    birthDate: bio.birthDate ?? undefined,
    birthPlace: bio.birthPlace ?? undefined,
    heightInches: bio.heightInches ?? undefined,
    weightLbs: bio.weightLbs ?? undefined,
    jersey: bio.jersey ?? undefined,
    draftInfo:
      draftYear && round && pick
        ? `${draftYear}: Rd ${round}, Pk ${pick}`
        : undefined,
  };
}

/** Baked bio for a `bref:slug` route or a legend NBA id, else null. */
export async function loadBakedLegendPlayer(
  playerId: string,
  nbaId?: string | null
): Promise<Player | null> {
  const slug = (
    parseBrefPlayerSlug(playerId) ??
    remapLegendNbaIdToBref(nbaId ?? playerId) ??
    ""
  ).replace(/^bref:/, "");
  if (!slug) return null;
  const baked = await loadBundledBrefCareer(slug).catch(() => null);
  return baked ? playerFromBrefBio(nbaId ?? playerId, baked.bio) : null;
}
