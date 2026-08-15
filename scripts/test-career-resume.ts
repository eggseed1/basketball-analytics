/**
 * Deterministic Career Resume analyzer checks (no test runner in repo).
 * Run: npx tsx scripts/test-career-resume.ts
 */
import assert from "node:assert/strict";

import {
  CAREER_LONGEVITY_OF_PEAK,
  CAREER_PRIME_OF_PEAK,
  careerProductionIndex,
  computeCareerResume,
  isCareerQualifyingSeason,
} from "../src/analytics/career-resume";
import type { PlayerSeason } from "../src/data/types";

function row(
  partial: Partial<PlayerSeason> &
    Pick<PlayerSeason, "season" | "gamesPlayed" | "minutes" | "points">
): PlayerSeason {
  return {
    playerId: "p1",
    playerName: "Test Player",
    teamId: "den",
    teamName: "Denver",
    assists: 0,
    rebounds: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fieldGoalPct: 0.45,
    threePointPct: 0.35,
    freeThrowPct: 0.8,
    trueShootingPct: 0.58,
    effectiveFieldGoalPct: 0.52,
    usagePct: 0,
    offensiveRating: 110,
    defensiveRating: 0,
    netRating: 0,
    ...partial,
  };
}

function assertFinite(n: number, label: string) {
  assert.ok(Number.isFinite(n), `${label} must be finite, got ${n}`);
}

// --- Single-season player ---
{
  const career = [
    row({
      season: "2024-25",
      gamesPlayed: 70,
      minutes: 70 * 32,
      points: 70 * 25,
      assists: 70 * 5,
      rebounds: 70 * 8,
    }),
  ];
  const resume = computeCareerResume({
    playerId: "p1",
    playerName: "Test Player",
    career,
  });
  assert.equal(resume.peak?.season, "2024-25");
  assert.equal(resume.prime, null);
  assert.equal(resume.longevity, null);
  assert.ok(resume.limitedReason);
  assertFinite(resume.peak!.cpi, "single peak cpi");
}

// --- Two-season player ---
{
  const career = [
    row({
      season: "2023-24",
      gamesPlayed: 65,
      minutes: 65 * 30,
      points: 65 * 18,
      assists: 65 * 4,
      rebounds: 65 * 6,
    }),
    row({
      season: "2024-25",
      gamesPlayed: 70,
      minutes: 70 * 32,
      points: 70 * 28,
      assists: 70 * 8,
      rebounds: 70 * 10,
    }),
  ];
  const resume = computeCareerResume({
    playerId: "p1",
    playerName: "Test Player",
    career,
  });
  assert.equal(resume.peak?.season, "2024-25");
  assert.ok(resume.prime);
  assert.ok(resume.longevity);
  assert.equal(resume.limitedReason, null);
  assert.ok(resume.prime!.seasonCount >= 1);
  assert.ok(resume.longevity!.seasonCount >= 1);
}

// --- Sustained elite (flat high production) ---
{
  const seasons = ["2018-19", "2019-20", "2020-21", "2021-22", "2022-23"];
  const career = seasons.map((season) =>
    row({
      season,
      gamesPlayed: 70,
      minutes: 70 * 34,
      points: 70 * 27,
      assists: 70 * 7,
      rebounds: 70 * 8,
      steals: 70 * 1.2,
      blocks: 70 * 0.6,
      turnovers: 70 * 3,
    })
  );
  const resume = computeCareerResume({
    playerId: "p1",
    playerName: "Star",
    career,
  });
  assert.equal(resume.qualifyingSeasons.length, 5);
  assert.equal(resume.prime?.contiguousCount, 5);
  assert.equal(resume.longevity?.seasonCount, 5);
  for (const s of resume.qualifyingSeasons) {
    assert.ok(s.ofPeak >= CAREER_PRIME_OF_PEAK - 1e-9);
  }
}

// --- Long career with decline ---
{
  const career = [
    row({
      season: "2015-16",
      gamesPlayed: 75,
      minutes: 75 * 28,
      points: 75 * 14,
      assists: 75 * 3,
      rebounds: 75 * 5,
    }),
    row({
      season: "2016-17",
      gamesPlayed: 75,
      minutes: 75 * 32,
      points: 75 * 22,
      assists: 75 * 5,
      rebounds: 75 * 7,
    }),
    row({
      season: "2017-18",
      gamesPlayed: 75,
      minutes: 75 * 34,
      points: 75 * 28,
      assists: 75 * 6,
      rebounds: 75 * 8,
    }),
    row({
      season: "2018-19",
      gamesPlayed: 70,
      minutes: 70 * 33,
      points: 70 * 26,
      assists: 70 * 6,
      rebounds: 70 * 7,
    }),
    row({
      season: "2019-20",
      gamesPlayed: 60,
      minutes: 60 * 28,
      points: 60 * 16,
      assists: 60 * 4,
      rebounds: 60 * 5,
    }),
    row({
      season: "2020-21",
      gamesPlayed: 55,
      minutes: 55 * 22,
      points: 55 * 10,
      assists: 55 * 2,
      rebounds: 55 * 4,
    }),
  ];
  const resume = computeCareerResume({
    playerId: "p1",
    playerName: "Veteran",
    career,
  });
  assert.equal(resume.peak?.season, "2017-18");
  assert.ok(resume.prime && resume.prime.seasonCount >= 1);
  assert.ok(resume.longevity && resume.longevity.seasonCount >= resume.prime.seasonCount);
  assert.ok(
    resume.trajectory.phases.some(
      (p) => p.id === "decline" || p.id === "sustained" || p.id === "late"
    ) || resume.trajectory.summary.includes("Latest")
  );
  const late = resume.qualifyingSeasons.find((s) => s.season === "2020-21");
  assert.ok(late);
  assert.ok(late!.ofPeak < CAREER_LONGEVITY_OF_PEAK || late!.ofPeak < 1);
}

// --- Career gaps + multi-team dedupe ---
{
  const career = [
    row({
      season: "2021-22",
      gamesPlayed: 40,
      minutes: 40 * 30,
      points: 40 * 20,
      teamId: "bos",
    }),
    row({
      season: "2021-22",
      gamesPlayed: 30,
      minutes: 30 * 28,
      points: 30 * 18,
      teamId: "bkn",
    }),
    row({
      season: "2023-24",
      gamesPlayed: 70,
      minutes: 70 * 32,
      points: 70 * 24,
      assists: 70 * 5,
    }),
  ];
  const resume = computeCareerResume({
    playerId: "p1",
    playerName: "Traded",
    career,
  });
  assert.equal(resume.qualifyingSeasons.length, 2);
  assert.equal(
    resume.qualifyingSeasons.find((s) => s.season === "2021-22")?.gamesPlayed,
    40
  );
}

// --- Partial current season excluded ---
{
  const career = [
    row({
      season: "2023-24",
      gamesPlayed: 70,
      minutes: 70 * 30,
      points: 70 * 20,
      assists: 70 * 5,
      rebounds: 70 * 6,
    }),
    row({
      season: "2024-25",
      gamesPlayed: 8,
      minutes: 8 * 30,
      points: 8 * 40,
      assists: 8 * 10,
      rebounds: 8 * 12,
    }),
  ];
  const resume = computeCareerResume({
    playerId: "p1",
    playerName: "Current",
    career,
    viewingSeason: "2024-25",
  });
  assert.equal(resume.peak?.season, "2023-24");
  assert.ok(resume.incompleteCurrent);
  assert.equal(resume.incompleteCurrent?.season, "2024-25");
  assert.ok(
    !resume.qualifyingSeasons.some((s) => s.season === "2024-25")
  );
}

// --- Non-qualifying tiny sample ---
{
  const career = [
    row({
      season: "2024-25",
      gamesPlayed: 5,
      minutes: 5 * 10,
      points: 5 * 4,
    }),
  ];
  assert.equal(isCareerQualifyingSeason(career[0]!), false);
  const resume = computeCareerResume({
    playerId: "p1",
    playerName: "Rookie",
    career,
    viewingSeason: "2024-25",
  });
  assert.equal(resume.peak, null);
  assert.ok(resume.limitedReason);
}

// --- Shortened-season accommodation ---
{
  const short = row({
    season: "2011-12",
    gamesPlayed: 16,
    minutes: 16 * 30,
    points: 16 * 22,
    assists: 16 * 5,
    rebounds: 16 * 6,
  });
  assert.equal(isCareerQualifyingSeason(short), true);
}

// --- CPI finite + formula sanity ---
{
  const r = row({
    season: "2024-25",
    gamesPlayed: 10,
    minutes: 300,
    points: 200,
    assists: 50,
    rebounds: 80,
    steals: 10,
    blocks: 5,
    turnovers: 20,
  });
  // PPG20 + 1.5*5 + 1.2*8 + 2*1 + 2*0.5 - 2 = 20+7.5+9.6+2+1-2 = 38.1
  assert.ok(Math.abs(careerProductionIndex(r) - 38.1) < 1e-6);
}

// --- Prime ⊆ Longevity (overlap) + longevity-only band ---
{
  // Peak CPI ≈ driven by points; keep other counting zeros for clarity.
  const career = [
    row({
      season: "2018-19",
      gamesPlayed: 70,
      minutes: 70 * 30,
      points: 70 * 20, // below longevity vs peak 30
    }),
    row({
      season: "2019-20",
      gamesPlayed: 70,
      minutes: 70 * 30,
      points: 70 * 24, // 80% — longevity-only
    }),
    row({
      season: "2020-21",
      gamesPlayed: 70,
      minutes: 70 * 30,
      points: 70 * 28, // ~93% — prime
    }),
    row({
      season: "2021-22",
      gamesPlayed: 70,
      minutes: 70 * 30,
      points: 70 * 30, // peak
    }),
    row({
      season: "2022-23",
      gamesPlayed: 70,
      minutes: 70 * 30,
      points: 70 * 22, // gap below prime
    }),
    row({
      season: "2023-24",
      gamesPlayed: 70,
      minutes: 70 * 30,
      points: 70 * 27, // prime again — shorter contiguous than earlier? 1 season
    }),
  ];
  const resume = computeCareerResume({
    playerId: "p1",
    playerName: "Overlap",
    career,
  });
  assert.equal(resume.peak?.season, "2021-22");
  for (const s of resume.qualifyingSeasons) {
    if (s.inPrimeBand) {
      assert.equal(
        s.inLongevityBand,
        true,
        `${s.season}: prime must be subset of longevity`
      );
      assert.ok(s.ofPeak + 1e-9 >= CAREER_PRIME_OF_PEAK);
    }
    if (s.inLongevityBand) {
      assert.ok(s.ofPeak + 1e-9 >= CAREER_LONGEVITY_OF_PEAK);
    }
  }
  const longevityOnly = resume.qualifyingSeasons.filter(
    (s) => s.inLongevityBand && !s.inPrimeBand
  );
  assert.ok(longevityOnly.length >= 1, "expected longevity-only seasons");
  assert.ok(longevityOnly.every((s) => s.ofPeak < CAREER_PRIME_OF_PEAK));
  // Contiguous prime should prefer the longer ≥90% run ending at peak (2020-21 → 2021-22)
  assert.equal(resume.prime?.contiguousFrom, "2020-21");
  assert.equal(resume.prime?.contiguousTo, "2021-22");
  assert.equal(resume.prime?.contiguousCount, 2);
}

console.log("career-resume checks passed");
