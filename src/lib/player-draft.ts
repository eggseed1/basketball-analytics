import { resolveTeamBrand } from "@/lib/nba-brand";

export type ParsedPlayerDraft = {
  year: number | null;
  round: number | null;
  pick: number | null;
  teamAbbr: string | null;
  teamKey: string | null;
  undrafted: boolean;
};

const ESPN_DISPLAY =
  /^(\d{4}):\s*Rd\s*(\d+),\s*Pk\s*(\d+)\s*(?:\(([A-Z]{2,3})\))?$/i;
const CORE_DISPLAY =
  /^Year:\s*(\d{4})\s*Round:\s*(\d+)\s*Pick:\s*(\d+)$/i;

/**
 * Parse ESPN `displayDraft` / NBA-style draft strings for identity UI.
 */
export function parsePlayerDraftInfo(
  draftInfo: string | null | undefined
): ParsedPlayerDraft | null {
  const raw = draftInfo?.trim();
  if (!raw) return null;
  if (/^undrafted$/i.test(raw) || /^udfa$/i.test(raw)) {
    return {
      year: null,
      round: null,
      pick: null,
      teamAbbr: null,
      teamKey: null,
      undrafted: true,
    };
  }
  const espn = ESPN_DISPLAY.exec(raw);
  if (espn) {
    const abbr = espn[4]?.toUpperCase() ?? null;
    return {
      year: Number(espn[1]),
      round: Number(espn[2]),
      pick: Number(espn[3]),
      teamAbbr: abbr,
      teamKey: abbr ? resolveTeamBrand(abbr)?.espnTeamId ?? abbr : null,
      undrafted: false,
    };
  }
  const core = CORE_DISPLAY.exec(raw);
  if (core) {
    return {
      year: Number(core[1]),
      round: Number(core[2]),
      pick: Number(core[3]),
      teamAbbr: null,
      teamKey: null,
      undrafted: false,
    };
  }
  return null;
}
