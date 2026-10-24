import type {
  HomeAnalytics,
  HomeDarkoLeader,
  HomeDrblLeader,
  HomePerformerSeason,
  HomeRaptorLeader,
} from "@/data/queries/home";

const LEADER_CAP = 12;

function rate(n: number | null | undefined) {
  return n != null && Number.isFinite(n) && n > 0
    ? Math.round(n * 1000) / 1000
    : null;
}

export type HomePerformersPayload = {
  season: string;
  drblLeaders: HomeDrblLeader[];
  darkoLeaders: Array<{
    profileId: string;
    nbaPlayerId: string;
    playerName: string;
    impact: number;
    teamKey?: string;
    teamAbbr?: string;
    teamId?: string;
    teamName?: string;
    trueShootingPct: number | null;
    usagePct: number | null;
  }>;
  raptorLeaders: Array<{
    profileId: string;
    nbaPlayerId: string;
    playerName: string;
    impact: number;
    teamKey?: string;
    teamAbbr?: string;
    teamId?: string;
    teamName?: string;
    trueShootingPct: number | null;
    usagePct: number | null;
  }>;
  tsLeaders: HomePerformerSeason[];
  usageStars: HomePerformerSeason[];
  drblOverlayOk: boolean;
  drblFallbackNote: string | null;
};

function slimSeasonRows(
  rows: HomeAnalytics["tsLeaders"]
): HomePerformerSeason[] {
  return rows.slice(0, LEADER_CAP).map((row) => ({
    playerId: row.playerId,
    playerName: row.playerName,
    teamAbbr: row.teamAbbreviation ?? undefined,
    trueShootingPct: rate(row.trueShootingPct),
    usagePct: rate(row.usagePct),
  }));
}

/** Compact Top Performers payload for the home desk / API. */
export function slimHomePerformers(data: HomeAnalytics): HomePerformersPayload {
  const darkoLeaders = data.darkoLeaders.slice(0, LEADER_CAP).map((p) => ({
    profileId: p.profileId,
    nbaPlayerId: p.nbaPlayerId ?? p.profileId,
    playerName: p.playerName,
    impact: Math.round(p.impact * 100) / 100,
    teamKey: p.teamKey,
    teamAbbr: p.teamAbbr,
    teamId: p.teamId,
    teamName: p.teamName,
    trueShootingPct: rate(p.trueShootingPct),
    usagePct: rate(p.usagePct),
  }));
  const raptorLeaders = data.raptorLeaders.slice(0, LEADER_CAP).map((p) => ({
    profileId: p.profileId,
    nbaPlayerId: p.nbaPlayerId ?? p.profileId,
    playerName: p.playerName,
    impact: Math.round(p.impact * 100) / 100,
    teamKey: p.teamKey,
    teamAbbr: p.teamAbbr,
    teamId: p.teamId,
    teamName: p.teamName,
    trueShootingPct: rate(p.trueShootingPct),
    usagePct: rate(p.usagePct),
  }));
  const drblLeaders = data.drblLeaders.slice(0, LEADER_CAP).map((p) => ({
    playerId: p.playerId,
    playerName: p.playerName,
    profileId: p.profileId,
    nbaPlayerId: p.nbaPlayerId,
    teamKey: p.teamKey,
    teamAbbr: p.teamAbbr,
    drbl100: Math.round(p.drbl100 * 100) / 100,
    r1Points: p.r1Points,
    war1: p.war1 != null ? Math.round(p.war1 * 100) / 100 : null,
    darko: p.darko != null ? Math.round(p.darko * 100) / 100 : null,
    trueShootingPct: rate(p.trueShootingPct),
    usagePct: rate(p.usagePct),
  }));

  return {
    season: data.season,
    drblLeaders,
    darkoLeaders,
    raptorLeaders,
    tsLeaders: slimSeasonRows(data.tsLeaders),
    usageStars: slimSeasonRows(data.usageStars),
    drblOverlayOk: data.drblOverlayOk,
    drblFallbackNote: data.drblFallbackNote,
  };
}

/** @internal cast helpers for TopPerformersPanel's stricter leader types */
export type { HomeDarkoLeader, HomeRaptorLeader };
