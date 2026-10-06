import type { CareerResume } from "@/analytics/career-resume";

export type CareerBandSeason = {
  season: string;
  cpi: number;
  /** Fraction of this player's peak CPI (1 = peak). */
  ofPeak: number;
  gamesPlayed: number;
  peak: boolean;
  primeBand: boolean;
  /** Inside the longest unbroken prime run that Career Resume displays. */
  primeWindow: boolean;
  longevityBand: boolean;
  /** Below the games/minutes floor, so outside every band. */
  incomplete: boolean;
};

export type CareerBands = {
  playerId: string;
  playerName: string;
  seasons: CareerBandSeason[];
  peak: { season: string; cpi: number } | null;
  primeWindow: { from: string; to: string; count: number } | null;
  primeBandCount: number;
  longevityCount: number;
  limitedReason: string | null;
};

/** The slice of a Career Resume that the Peak / Prime / Longevity chart draws. */
export function toCareerBands(resume: CareerResume): CareerBands {
  const prime = resume.prime;
  const inWindow = (season: string) =>
    prime?.contiguousFrom != null &&
    prime.contiguousTo != null &&
    season >= prime.contiguousFrom &&
    season <= prime.contiguousTo;

  const seasons: CareerBandSeason[] = resume.qualifyingSeasons.map((s) => ({
    season: s.season,
    cpi: s.cpi,
    ofPeak: s.ofPeak,
    gamesPlayed: s.gamesPlayed,
    peak: resume.peak?.season === s.season,
    primeBand: s.inPrimeBand,
    primeWindow: s.inPrimeBand && inWindow(s.season),
    longevityBand: s.inLongevityBand,
    incomplete: false,
  }));
  const current = resume.incompleteCurrent;
  if (current && !seasons.some((s) => s.season === current.season)) {
    seasons.push({
      season: current.season,
      cpi: current.cpi,
      ofPeak: current.ofPeak,
      gamesPlayed: current.gamesPlayed,
      peak: false,
      primeBand: false,
      primeWindow: false,
      longevityBand: false,
      incomplete: true,
    });
  }
  seasons.sort((a, b) => a.season.localeCompare(b.season));

  return {
    playerId: resume.playerId,
    playerName: resume.playerName,
    seasons,
    peak: resume.peak ? { season: resume.peak.season, cpi: resume.peak.cpi } : null,
    primeWindow:
      prime?.contiguousFrom && prime.contiguousTo
        ? { from: prime.contiguousFrom, to: prime.contiguousTo, count: prime.contiguousCount }
        : null,
    primeBandCount: prime?.seasonCount ?? 0,
    longevityCount: resume.longevity?.seasonCount ?? 0,
    limitedReason: resume.limitedReason,
  };
}
