import type { Player } from "@/data/types";
import { espnFetchJson } from "@/data/providers/nba/espn-client";
import {
  transformEspnAthleteProfile,
  type EspnAthleteProfileResponse,
} from "@/data/transformers/espn-career";

const SITE_WEB = "https://site.web.api.espn.com";

/** ESPN athlete ids are numeric (typically 3–8 digits). */
export function looksLikeEspnAthleteId(playerId: string): boolean {
  return /^\d{3,8}$/.test(playerId.trim());
}

/**
 * Live bio from ESPN athlete profile (height, weight, DOB, draft, college, …).
 * Used to enrich player pages regardless of DATA_PROVIDER.
 */
export async function fetchEspnAthleteBio(
  playerId: string
): Promise<Player | null> {
  if (!looksLikeEspnAthleteId(playerId)) return null;
  try {
    const url = `${SITE_WEB}/apis/common/v3/sports/basketball/nba/athletes/${playerId}`;
    const payload = await espnFetchJson<EspnAthleteProfileResponse>(url, {
      ttlMs: 1000 * 60 * 60 * 12,
      retries: 1,
    });
    return transformEspnAthleteProfile(payload, playerId);
  } catch {
    return null;
  }
}

export function mergePlayerBio(
  base: Player | null,
  bio: Player | null
): Player | null {
  if (!base && !bio) return null;
  if (!base) return bio;
  if (!bio) return base;
  return {
    id: base.id || bio.id,
    fullName: bio.fullName || base.fullName,
    firstName: bio.firstName || base.firstName,
    lastName: bio.lastName || base.lastName,
    position: bio.position ?? base.position,
    birthDate: bio.birthDate ?? base.birthDate,
    birthPlace: bio.birthPlace ?? base.birthPlace,
    heightInches: bio.heightInches ?? base.heightInches,
    weightLbs: bio.weightLbs ?? base.weightLbs,
    currentTeamId: bio.currentTeamId ?? base.currentTeamId,
    jersey: bio.jersey ?? base.jersey,
    college: bio.college ?? base.college,
    draftInfo: bio.draftInfo ?? base.draftInfo,
    experience: bio.experience ?? base.experience,
    age: bio.age ?? base.age,
    debutYear: bio.debutYear ?? base.debutYear,
  };
}
