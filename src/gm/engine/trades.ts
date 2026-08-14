import type {
  GmDraftPick,
  GmLeagueState,
  GmPlayer,
  GmTradeAsset,
  GmTradeProposal,
} from "@/gm/types";
import { playerValue, salariesMatch, teamPayrollM } from "@/gm/engine/cap";
import { uid } from "@/gm/engine/rng";

export function assetSalary(
  asset: GmTradeAsset,
  players: GmPlayer[]
): number {
  if (asset.type === "pick") return 0;
  return players.find((p) => p.id === asset.id)?.contract?.annualSalaryM ?? 0;
}

export function assetValue(
  asset: GmTradeAsset,
  players: GmPlayer[],
  picks: GmDraftPick[]
): number {
  if (asset.type === "player") {
    const p = players.find((x) => x.id === asset.id);
    return p ? playerValue(p) : 0;
  }
  const pick = picks.find((x) => x.id === asset.id);
  if (!pick) return 0;
  return pick.round === 1 ? 18 : 5;
}

export function evaluateTrade(
  state: GmLeagueState,
  fromTeamId: string,
  toTeamId: string,
  fromAssets: GmTradeAsset[],
  toAssets: GmTradeAsset[]
): { ok: boolean; reason?: string; fromValue: number; toValue: number } {
  const allPicks = state.teams.flatMap((t) => t.draftPicks);
  const fromSal = fromAssets.reduce(
    (s, a) => s + assetSalary(a, state.players),
    0
  );
  const toSal = toAssets.reduce((s, a) => s + assetSalary(a, state.players), 0);
  const fromPay = teamPayrollM(fromTeamId, state.players);
  const overCap = fromPay > state.settings.salaryCapM;
  if (!salariesMatch(fromSal, toSal, overCap)) {
    return {
      ok: false,
      reason: "Salaries do not match under cap rules.",
      fromValue: 0,
      toValue: 0,
    };
  }

  const fromValue = fromAssets.reduce(
    (s, a) => s + assetValue(a, state.players, allPicks),
    0
  );
  const toValue = toAssets.reduce(
    (s, a) => s + assetValue(a, state.players, allPicks),
    0
  );

  // Partner AI: accept if they gain value or within 4 points when rebuilding
  const partner = state.teams.find((t) => t.id === toTeamId)!;
  const threshold = partner.ownerGoal === "tank" ? -8 : 2;
  if (toValue - fromValue < threshold) {
    return {
      ok: false,
      reason: `${partner.abbr} rejects - not enough value for them.`,
      fromValue,
      toValue,
    };
  }
  return { ok: true, fromValue, toValue };
}

export function applyTrade(
  state: GmLeagueState,
  proposal: Omit<GmTradeProposal, "id" | "status"> & {
    status?: GmTradeProposal["status"];
  }
): GmLeagueState {
  const players = state.players.map((p) => ({ ...p }));
  const teams = state.teams.map((t) => ({
    ...t,
    draftPicks: [...t.draftPicks],
    starters: { ...t.starters },
    benchOrder: [...t.benchOrder],
  }));

  const movePlayer = (playerId: string, newTeam: string) => {
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    const oldTeam = teams.find((t) => t.id === p.teamId);
    if (oldTeam) {
      for (const pos of Object.keys(oldTeam.starters) as Array<
        keyof typeof oldTeam.starters
      >) {
        if (oldTeam.starters[pos] === playerId) oldTeam.starters[pos] = null;
      }
      oldTeam.benchOrder = oldTeam.benchOrder.filter((id) => id !== playerId);
    }
    p.teamId = newTeam;
    const nt = teams.find((t) => t.id === newTeam)!;
    if (!nt.benchOrder.includes(playerId)) nt.benchOrder.push(playerId);
  };

  const movePick = (pickId: string, newOwner: string) => {
    for (const t of teams) {
      const idx = t.draftPicks.findIndex((p) => p.id === pickId);
      if (idx >= 0) {
        const [pick] = t.draftPicks.splice(idx, 1);
        if (pick) {
          pick.ownerTeamId = newOwner;
          teams.find((x) => x.id === newOwner)!.draftPicks.push(pick);
        }
        break;
      }
    }
  };

  for (const a of proposal.fromAssets) {
    if (a.type === "player") movePlayer(a.id, proposal.toTeamId);
    else movePick(a.id, proposal.toTeamId);
  }
  for (const a of proposal.toAssets) {
    if (a.type === "player") movePlayer(a.id, proposal.fromTeamId);
    else movePick(a.id, proposal.fromTeamId);
  }

  const log: GmTradeProposal = {
    id: uid("tr"),
    fromTeamId: proposal.fromTeamId,
    toTeamId: proposal.toTeamId,
    fromAssets: proposal.fromAssets,
    toAssets: proposal.toAssets,
    status: "accepted",
  };

  return {
    ...state,
    players,
    teams,
    tradeLog: [log, ...state.tradeLog].slice(0, 100),
    news: [
      {
        id: uid("news"),
        day: state.day,
        season: state.season,
        headline: "Trade completed",
        body: `Assets swapped between ${proposal.fromTeamId.toUpperCase()} and ${proposal.toTeamId.toUpperCase()}.`,
        tone: "trade" as const,
      },
      ...state.news,
    ].slice(0, 50),
    updatedAt: new Date().toISOString(),
  };
}
