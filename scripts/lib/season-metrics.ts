/**
 * Season advanced metrics computed from NBA box score totals with the published
 * methods: rate stats and Win Shares as defined in Basketball-Reference's
 * glossary and "Calculating Win Shares" (Dean Oliver's points produced, stops and
 * defensive rating), PER as John Hollinger defined it, and Box Plus/Minus 2.0 and
 * VORP from Daniel Myers' BPM 2.0 calculator.
 *
 * BPM here is the season-level version. Basketball-Reference sums game-level BPM,
 * which can differ by about half a point for players who missed many games.
 */

export type Box = {
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
};

export type TeamSeason = Box & {
  teamId: number;
  gp: number;
  w: number;
  l: number;
  /** Game minutes (48 per regulation game), not player minutes. */
  min: number;
  opp: Box;
};

export type Stint = Box & {
  pid: number;
  name: string;
  teamId: number;
  team: string;
  first: string;
  gp: number;
  min: number;
};

export type StintMetrics = {
  per: number;
  ts: number;
  fg3Ar: number;
  ftr: number;
  orbPct: number;
  drbPct: number;
  trbPct: number;
  astPct: number;
  stlPct: number;
  blkPct: number;
  tovPct: number;
  usg: number;
  ows: number;
  dws: number;
  ws: number;
  bpm: number;
  obpm: number;
  dbpm: number;
  vorp: number;
  /** Estimated position, 1 (point guard) to 5 (center). */
  position: number;
  offensiveRole: number;
};

const safeDiv = (a: number, b: number): number => (b !== 0 && Number.isFinite(b) ? a / b : 0);

/** Basketball-Reference's team possession estimate (average of team and opponent). */
export function teamPossessions(t: Box, o: Box): number {
  const side = (a: Box, b: Box) =>
    a.fga + 0.4 * a.fta - 1.07 * safeDiv(a.oreb, a.oreb + b.dreb) * (a.fga - a.fgm) + a.tov;
  return 0.5 * (side(t, o) + side(o, t));
}

type TeamContext = {
  team: TeamSeason;
  /** Player minutes: five times game minutes. */
  mp: number;
  poss: number;
  pace: number;
  netRating: number;
  offRatingRel: number;
};

type LeagueContext = {
  totals: Box;
  mp: number;
  poss: number;
  pace: number;
  ppp: number;
  ppg: number;
};

function sumBox(rows: Box[]): Box {
  const out: Box = { fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pts: 0 };
  for (const r of rows) for (const k of Object.keys(out) as (keyof Box)[]) out[k] += r[k];
  return out;
}

function contexts(teams: TeamSeason[]): { league: LeagueContext; byTeam: Map<number, TeamContext> } {
  const totals = sumBox(teams);
  const mp = teams.reduce((s, t) => s + 5 * t.min, 0);
  const poss = teams.reduce((s, t) => s + teamPossessions(t, t.opp), 0);
  const games = teams.reduce((s, t) => s + t.gp, 0);
  const league: LeagueContext = {
    totals,
    mp,
    poss,
    pace: 48 * safeDiv(poss, mp / 5),
    ppp: safeDiv(totals.pts, poss),
    ppg: safeDiv(totals.pts, games),
  };
  const byTeam = new Map<number, TeamContext>();
  for (const team of teams) {
    const tmp = 5 * team.min;
    const tposs = teamPossessions(team, team.opp);
    byTeam.set(team.teamId, {
      team,
      mp: tmp,
      poss: tposs,
      pace: 48 * safeDiv(tposs, tmp / 5),
      netRating: 100 * safeDiv(team.pts - team.opp.pts, tposs),
      offRatingRel: 100 * safeDiv(team.pts, tposs) - 100 * league.ppp,
    });
  }
  return { league, byTeam };
}

function unadjustedPer(p: Stint, t: TeamSeason, lg: Box): number {
  const factor = 2 / 3 - safeDiv(0.5 * safeDiv(lg.ast, lg.fgm), 2 * safeDiv(lg.fgm, lg.ftm));
  const vop = safeDiv(lg.pts, lg.fga - lg.oreb + lg.tov + 0.44 * lg.fta);
  const drbPct = safeDiv(lg.reb - lg.oreb, lg.reb);
  const tmAstFg = safeDiv(t.ast, t.fgm);
  const value =
    p.fg3m +
    (2 / 3) * p.ast +
    (2 - factor * tmAstFg) * p.fgm +
    p.ftm * 0.5 * (1 + (1 - tmAstFg) + (2 / 3) * tmAstFg) -
    vop * p.tov -
    vop * drbPct * (p.fga - p.fgm) -
    vop * 0.44 * (0.44 + 0.56 * drbPct) * (p.fta - p.ftm) +
    vop * (1 - drbPct) * (p.reb - p.oreb) +
    vop * drbPct * p.oreb +
    vop * p.stl +
    vop * drbPct * p.blk -
    p.pf * (safeDiv(lg.ftm, lg.pf) - 0.44 * safeDiv(lg.fta, lg.pf) * vop);
  return safeDiv(value, p.min);
}

function winShares(p: Stint, c: TeamContext, lg: LeagueContext): { ows: number; dws: number } {
  const t = c.team;
  const o = t.opp;
  const mp = p.min;
  const ftFactor = (ftm: number, fta: number) => (fta > 0 ? 1 - (1 - ftm / fta) ** 2 : 0);

  // Points produced and offensive possessions.
  const share = safeDiv(mp, c.mp / 5);
  const qAst =
    share * (1.14 * safeDiv(t.ast - p.ast, t.fgm)) +
    safeDiv(safeDiv(t.ast, c.mp) * mp * 5 - p.ast, safeDiv(t.fgm, c.mp) * mp * 5 - p.fgm) * (1 - share);
  const shotPart = 1 - 0.5 * safeDiv(p.pts - p.ftm, 2 * p.fga) * qAst;
  const fgPart = p.fgm * shotPart;
  const astPart = 0.5 * safeDiv(t.pts - t.ftm - (p.pts - p.ftm), 2 * (t.fga - p.fga)) * p.ast;
  const ftPart = ftFactor(p.ftm, p.fta) * 0.4 * p.fta;
  const teamScPoss = t.fgm + ftFactor(t.ftm, t.fta) * t.fta * 0.4;
  const teamOrbPct = safeDiv(t.oreb, t.oreb + (o.reb - o.oreb));
  const teamPlayPct = safeDiv(teamScPoss, t.fga + t.fta * 0.4 + t.tov);
  const teamOrbWeight = safeDiv(
    (1 - teamOrbPct) * teamPlayPct,
    (1 - teamOrbPct) * teamPlayPct + teamOrbPct * (1 - teamPlayPct),
  );
  const orbPart = p.oreb * teamOrbWeight * teamPlayPct;
  const orbDiscount = 1 - safeDiv(t.oreb, teamScPoss) * teamOrbWeight * teamPlayPct;
  const scPoss = (fgPart + astPart + ftPart) * orbDiscount + orbPart;
  const fgxPoss = (p.fga - p.fgm) * (1 - 1.07 * teamOrbPct);
  const ftxPoss = p.fta > 0 ? (1 - p.ftm / p.fta) ** 2 * 0.4 * p.fta : 0;
  const totPoss = scPoss + fgxPoss + ftxPoss + p.tov;
  const pprodFg = 2 * (p.fgm + 0.5 * p.fg3m) * shotPart;
  const pprodAst =
    2 *
    safeDiv(t.fgm - p.fgm + 0.5 * (t.fg3m - p.fg3m), t.fgm - p.fgm) *
    0.5 *
    safeDiv(t.pts - t.ftm - (p.pts - p.ftm), 2 * (t.fga - p.fga)) *
    p.ast;
  const pprodOrb = p.oreb * teamOrbWeight * teamPlayPct * safeDiv(t.pts, teamScPoss);
  const pprod = (pprodFg + pprodAst + p.ftm) * orbDiscount + pprodOrb;

  // Stops and defensive rating.
  const dorPct = safeDiv(o.oreb, o.oreb + t.dreb);
  const dfgPct = safeDiv(o.fgm, o.fga);
  const fmwt = safeDiv(dfgPct * (1 - dorPct), dfgPct * (1 - dorPct) + (1 - dfgPct) * dorPct);
  const stops1 = p.stl + p.blk * fmwt * (1 - 1.07 * dorPct) + p.dreb * (1 - fmwt);
  const stops2 =
    (safeDiv(o.fga - o.fgm - t.blk, c.mp) * fmwt * (1 - 1.07 * dorPct) + safeDiv(o.tov - t.stl, c.mp)) * mp +
    safeDiv(p.pf, t.pf) * 0.4 * o.fta * (o.fta > 0 ? (1 - o.ftm / o.fta) ** 2 : 0);
  const stopPct = safeDiv((stops1 + stops2) * c.mp, c.poss * mp);
  const teamDrtg = 100 * safeDiv(o.pts, c.poss);
  const dPtsPerScPoss = safeDiv(o.pts, o.fgm + ftFactor(o.ftm, o.fta) * o.fta * 0.4);
  const drtg = teamDrtg + 0.2 * (100 * dPtsPerScPoss * (1 - stopPct) - teamDrtg);

  const marginalPtsPerWin = 0.32 * lg.ppg * safeDiv(c.pace, lg.pace);
  const marginalOffense = pprod - 0.92 * lg.ppp * totPoss;
  const marginalDefense = safeDiv(mp, c.mp) * c.poss * (1.08 * lg.ppp - drtg / 100);
  return {
    ows: safeDiv(marginalOffense, marginalPtsPerWin),
    dws: safeDiv(marginalDefense, marginalPtsPerWin),
  };
}

/** Myers' BPM 2.0 calculator constants. */
const BPM = {
  baselinePtsPerTsa: 1.0,
  position: { intercept: 2.1296, trb: 8.6676, stl: -2.4861, pf: 0.992, ast: -3.5361, blk: 1.6669, minWeight: 50 },
  role: { intercept: 6.0, ast: -6.6416, thresh: -8.5441, threshold: -0.33, defaultRole: 4.0, minWeight: 50 },
  leadEffect: 0.35,
  replacement: -2.0,
  // [position 1, position 5]; FGA and FTA interpolate on offensive role instead.
  total: {
    adjPts: [0.86, 0.86], fga: [-0.56, -0.78], fta: [-0.2464, -0.3432], fg3m: [0.389, 0.389],
    ast: [0.58, 1.034], tov: [-0.964, -0.964], oreb: [0.613, 0.181], dreb: [0.116, 0.181],
    stl: [1.369, 1.008], blk: [1.327, 0.703], pf: [-0.367, -0.367],
    positionConstantPg: -0.818, roleSlope: 1.387,
  },
  offense: {
    adjPts: [0.605, 0.605], fga: [-0.33, -0.472], fta: [-0.1452, -0.20768], fg3m: [0.477, 0.477],
    ast: [0.476, 0.476], tov: [-0.579, -0.882], oreb: [0.606, 0.422], dreb: [-0.112, 0.103],
    stl: [0.177, 0.294], blk: [0.725, 0.097], pf: [-0.439, -0.439],
    positionConstantPg: -1.698, roleSlope: 0.43,
  },
} as const;

type Coefs = (typeof BPM)["total"] | (typeof BPM)["offense"];

const clamp15 = (v: number) => Math.max(1, Math.min(5, v));
const lerp = (pair: readonly [number, number], at: number) => ((5 - at) / 4) * pair[0] + ((at - 1) / 4) * pair[1];

/** Team minute-weighted average pinned to 3.0, three passes as in the calculator. */
function centerOnTeam(values: number[], minutes: number[], teamMp: number): number[] {
  let shift = 0;
  for (let pass = 0; pass < 3; pass++) {
    const trimmed = values.map((v) => clamp15(v - shift));
    const avg = safeDiv(trimmed.reduce((s, v, i) => s + v * minutes[i]!, 0), teamMp);
    shift += avg - 3;
  }
  return values.map((v) => clamp15(v - shift));
}

/** Listed NBA position (G, F-C, ...) on the 1-5 scale, 3 when unknown. */
export function listedPositionNumber(listed: string | undefined): number {
  const parts = String(listed ?? "")
    .toUpperCase()
    .split("-")
    .map((s) => ({ G: 1.5, F: 3.5, C: 5 })[s.trim() as "G" | "F" | "C"])
    .filter((n): n is number => n != null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 3;
}

function rawBpm(per100: Record<string, number>, pos: number, role: number, c: Coefs): number {
  const sum =
    lerp(c.adjPts, pos) * per100.adjPts! +
    lerp(c.fga, role) * per100.fga! +
    lerp(c.fta, role) * per100.fta! +
    lerp(c.fg3m, pos) * per100.fg3m! +
    lerp(c.ast, pos) * per100.ast! +
    lerp(c.tov, pos) * per100.tov! +
    lerp(c.oreb, pos) * per100.oreb! +
    lerp(c.dreb, pos) * per100.dreb! +
    lerp(c.stl, pos) * per100.stl! +
    lerp(c.blk, pos) * per100.blk! +
    lerp(c.pf, pos) * per100.pf!;
  const positionConstant = pos < 3 ? ((3 - pos) / 2) * c.positionConstantPg : 0;
  return sum + positionConstant + c.roleSlope * (role - 3);
}

export type BpmInput = {
  stints: Stint[];
  team: { pts: number; fga: number; fta: number; reb: number; stl: number; pf: number; ast: number; blk: number; gp: number };
  /** Team player minutes (five times game minutes). */
  teamMp: number;
  pace: number;
  netRating: number;
  offRatingRel: number;
  listedPosition: (pid: number) => number;
};

export type TeamBpmRow = { bpm: number; obpm: number; vorp: number; position: number; role: number };

/** BPM, OBPM, VORP, position and offensive role for every player on one team. */
export function teamBpm(input: BpmInput): Map<number, TeamBpmRow> {
  const { stints: players, team, teamMp, pace } = input;
  const tmPtsPerTsa = safeDiv(team.pts, team.fga + 0.44 * team.fta);
  const tsa = players.map((p) => p.fga + 0.44 * p.fta);
  const thresh = players.map((p, i) => tsa[i]! * (safeDiv(p.pts, tsa[i]!) - (tmPtsPerTsa + BPM.role.threshold)));
  const teamThresh = thresh.reduce((a, b) => a + b, 0);
  const minutes = players.map((p) => p.min);
  const minShare = players.map((p) => safeDiv(p.min, teamMp / 5));
  const pctOf = (v: number, total: number, i: number) => safeDiv(safeDiv(v, total), minShare[i]!);

  const posRaw = players.map((p, i) => {
    const est =
      BPM.position.intercept +
      BPM.position.trb * pctOf(p.reb, team.reb, i) +
      BPM.position.stl * pctOf(p.stl, team.stl, i) +
      BPM.position.pf * pctOf(p.pf, team.pf, i) +
      BPM.position.ast * pctOf(p.ast, team.ast, i) +
      BPM.position.blk * pctOf(p.blk, team.blk, i);
    const w = BPM.position.minWeight;
    return (est * p.min + input.listedPosition(p.pid) * w) / (p.min + w);
  });
  const roleRaw = players.map((p, i) => {
    const est = BPM.role.intercept + BPM.role.ast * pctOf(p.ast, team.ast, i) + BPM.role.thresh * pctOf(thresh[i]!, teamThresh, i);
    const w = BPM.role.minWeight;
    return (est * p.min + BPM.role.defaultRole * w) / (p.min + w);
  });
  const position = centerOnTeam(posRaw, minutes, teamMp);
  const role = centerOnTeam(roleRaw, minutes, teamMp);

  const raw = players.map((p, i) => {
    const poss = (p.min * pace) / 48;
    const adjPts = (safeDiv(p.pts, tsa[i]!) - tmPtsPerTsa + BPM.baselinePtsPerTsa) * tsa[i]!;
    const per100 = Object.fromEntries(
      Object.entries({ adjPts, fga: p.fga, fta: p.fta, fg3m: p.fg3m, ast: p.ast, tov: p.tov, oreb: p.oreb, dreb: p.dreb, stl: p.stl, blk: p.blk, pf: p.pf }).map(
        ([k, v]) => [k, safeDiv(v, poss) * 100],
      ),
    );
    return {
      total: rawBpm(per100, position[i]!, role[i]!, BPM.total),
      offense: rawBpm(per100, position[i]!, role[i]!, BPM.offense),
    };
  });

  const avgLead = (input.netRating * pace) / 100 / 2;
  const leadBonus = (BPM.leadEffect / 2) * avgLead;
  const target = input.netRating + leadBonus;
  const targetOff = input.offRatingRel + leadBonus / 2;
  const contrib = raw.reduce((s, r, i) => s + r.total * minShare[i]!, 0);
  const contribOff = raw.reduce((s, r, i) => s + r.offense * minShare[i]!, 0);
  const adj = (target - contrib) / 5;
  const adjOff = (targetOff - contribOff) / 5;

  const out = new Map<number, TeamBpmRow>();
  players.forEach((p, i) => {
    const bpm = raw[i]!.total + adj;
    out.set(p.pid, {
      bpm,
      obpm: raw[i]!.offense + adjOff,
      vorp: (bpm - BPM.replacement) * minShare[i]! * (team.gp / 82),
      position: position[i]!,
      role: role[i]!,
    });
  });
  return out;
}

/** Every advanced metric for every player-team stint in one season. */
export function seasonMetrics(
  stints: Stint[],
  teams: TeamSeason[],
  listedPosition: (pid: number) => number,
): Map<string, StintMetrics> {
  const { league, byTeam } = contexts(teams);
  const lg = league.totals;
  const key = (s: Stint) => `${s.pid}|${s.teamId}`;

  const bpmByStint = new Map<string, TeamBpmRow>();
  for (const [teamId, c] of byTeam) {
    const roster = stints.filter((s) => s.teamId === teamId && s.min > 0);
    const result = teamBpm({
      stints: roster,
      team: c.team,
      teamMp: c.mp,
      pace: c.pace,
      netRating: c.netRating,
      offRatingRel: c.offRatingRel,
      listedPosition,
    });
    for (const s of roster) bpmByStint.set(key(s), result.get(s.pid)!);
  }

  const aPer = new Map<string, number>();
  let perWeighted = 0;
  let perMinutes = 0;
  for (const s of stints) {
    const c = byTeam.get(s.teamId);
    if (!c || s.min <= 0) continue;
    const value = unadjustedPer(s, c.team, lg) * safeDiv(league.pace, c.pace);
    aPer.set(key(s), value);
    perWeighted += value * s.min;
    perMinutes += s.min;
  }
  const lgAPer = safeDiv(perWeighted, perMinutes);

  const out = new Map<string, StintMetrics>();
  for (const s of stints) {
    const c = byTeam.get(s.teamId);
    const b = bpmByStint.get(key(s));
    if (!c || !b || s.min <= 0) continue;
    const t = c.team;
    const o = t.opp;
    const onCourt = safeDiv(c.mp / 5, s.min);
    const ws = winShares(s, c, league);
    out.set(key(s), {
      per: safeDiv(aPer.get(key(s)) ?? 0, lgAPer) * 15,
      ts: safeDiv(s.pts, 2 * (s.fga + 0.44 * s.fta)),
      fg3Ar: safeDiv(s.fg3a, s.fga),
      ftr: safeDiv(s.fta, s.fga),
      orbPct: 100 * safeDiv(s.oreb * onCourt, t.oreb + o.dreb),
      drbPct: 100 * safeDiv(s.dreb * onCourt, t.dreb + o.oreb),
      trbPct: 100 * safeDiv(s.reb * onCourt, t.reb + o.reb),
      astPct: 100 * safeDiv(s.ast, safeDiv(s.min, c.mp / 5) * t.fgm - s.fgm),
      stlPct: 100 * safeDiv(s.stl * onCourt, c.poss),
      blkPct: 100 * safeDiv(s.blk * onCourt, o.fga - o.fg3a),
      tovPct: 100 * safeDiv(s.tov, s.fga + 0.44 * s.fta + s.tov),
      usg: 100 * safeDiv((s.fga + 0.44 * s.fta + s.tov) * onCourt, t.fga + 0.44 * t.fta + t.tov),
      ows: ws.ows,
      dws: ws.dws,
      ws: ws.ows + ws.dws,
      bpm: b.bpm,
      obpm: b.obpm,
      dbpm: b.bpm - b.obpm,
      vorp: b.vorp,
      position: b.position,
      offensiveRole: b.role,
    });
  }
  return out;
}
