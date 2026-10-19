import type {
  GmDraftPick,
  GmLeagueState,
  GmPlayer,
  GmTeam,
  GmTradeAsset,
  GmTradeProposal,
} from "@/gm/types";
import { teamPayrollM, tradeSalaryLegal } from "@/gm/engine/cap";
import { pickTradePoints, playerTradePoints, stanceMultiplier, tradeStance } from "@/gm/engine/value";
import { autoSetLineup } from "@/gm/engine/lineup";
import { uid } from "@/gm/engine/rng";

const CASH_ANCHOR = 140.588;

export function cashLimitM(settings: { salaryCapM: number }): number {
  return Math.round((7 * settings.salaryCapM) / CASH_ANCHOR * 10) / 10;
}

export function teamCashM(
  team: GmTeam,
  settings: { salaryCapM: number }
): number {
  return team.cashM ?? cashLimitM(settings);
}

export function assetSalary(
  asset: GmTradeAsset,
  players: GmPlayer[]
): number {
  if (asset.type !== "player") return 0;
  return players.find((p) => p.id === asset.id)?.contract?.annualSalaryM ?? 0;
}

/** What these assets are worth on one club's board. */
export function boardValue(
  state: GmLeagueState,
  viewerId: string,
  assets: GmTradeAsset[]
): number {
  const picks = state.teams.flatMap((team) => team.draftPicks);
  return assets.reduce((sum, asset) => {
    const player =
      asset.type === "player" ? state.players.find((entry) => entry.id === asset.id) : undefined;
    const pick = asset.type === "pick" ? picks.find((entry) => entry.id === asset.id) : undefined;
    const base = assetValue(asset, state.players, picks, state);
    return sum + Math.round(base * stanceMultiplier(state, viewerId, asset, player, pick));
  }, 0);
}

export function assetValue(
  asset: GmTradeAsset,
  players: GmPlayer[],
  picks: GmDraftPick[],
  league?: GmLeagueState
): number {
  if (asset.type === "player") {
    const p = players.find((x) => x.id === asset.id);
    return p ? playerTradePoints(p) : 0;
  }
  if (asset.type === "cash") return (asset.cashM ?? 0) * 0.6;
  const pick = picks.find((x) => x.id === asset.id);
  if (!pick || !league) return 0;
  return pickTradePoints(league, pick);
}

function cashIn(assets: GmTradeAsset[]): number {
  return assets
    .filter((asset) => asset.type === "cash")
    .reduce((sum, asset) => sum + (asset.cashM ?? 0), 0);
}

/** Seasons in which the team still controls a first after the deal. */
function firstSeasons(
  team: GmTeam,
  sentIds: Set<string>,
  received: GmDraftPick[]
): Set<number> {
  const seasons = new Set<number>();
  for (const pick of team.draftPicks) {
    if (pick.round !== 1) continue;
    const traded = sentIds.has(pick.id);
    if (!traded || (pick.protectionTopN ?? 0) > 0) seasons.add(pick.season);
  }
  for (const pick of received) {
    if (pick.round === 1) seasons.add(pick.season);
  }
  return seasons;
}

export function stepienViolation(
  team: GmTeam,
  sent: GmTradeAsset[],
  receivedPicks: GmDraftPick[],
  season: number
): boolean {
  const sentIds = new Set(
    sent.filter((asset) => asset.type === "pick").map((asset) => asset.id)
  );
  const before = [...firstSeasons(team, new Set(), [])].sort((a, b) => a - b);
  const after = firstSeasons(team, sentIds, receivedPicks);
  for (let i = 0; i < before.length - 1; i += 1) {
    const year = before[i]!;
    const next = before[i + 1]!;
    if (next !== year + 1) continue;
    if (year < season) continue;
    if (!after.has(year) && !after.has(next)) return true;
  }
  return false;
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
  const fromPlayersOut = fromAssets.filter((a) => a.type === "player").length;
  const toPlayersOut = toAssets.filter((a) => a.type === "player").length;
  const fromTeam = state.teams.find((t) => t.id === fromTeamId);
  const toTeam = state.teams.find((t) => t.id === toTeamId);
  const fromLegal = tradeSalaryLegal({
    payrollM: teamPayrollM(
      fromTeamId,
      state.players,
      fromTeam?.deadMoney ?? []
    ),
    outM: fromSal,
    inM: toSal,
    outCount: fromPlayersOut,
    inCount: toPlayersOut,
    settings: state.settings,
  });
  if (!fromLegal.ok) {
    return { ok: false, reason: fromLegal.reason, fromValue: 0, toValue: 0 };
  }
  const toLegal = tradeSalaryLegal({
    payrollM: teamPayrollM(toTeamId, state.players, toTeam?.deadMoney ?? []),
    outM: toSal,
    inM: fromSal,
    outCount: toPlayersOut,
    inCount: fromPlayersOut,
    settings: state.settings,
  });
  if (!toLegal.ok) {
    return {
      ok: false,
      reason: `${toTeam?.abbr ?? "The other team"}: ${toLegal.reason}`,
      fromValue: 0,
      toValue: 0,
    };
  }

  if (!fromTeam || !toTeam) {
    return { ok: false, reason: "Team not found.", fromValue: 0, toValue: 0 };
  }
  const blockedPlayer = (assets: GmTradeAsset[], club: GmTeam) =>
    assets.some(
      (asset) =>
        asset.type === "player" &&
        (club.untouchables ?? []).includes(asset.id)
    );
  if (blockedPlayer(fromAssets, fromTeam) || blockedPlayer(toAssets, toTeam)) {
    return {
      ok: false,
      reason: "An untouchable player is in the deal.",
      fromValue: 0,
      toValue: 0,
    };
  }
  const fromCash = cashIn(fromAssets);
  const toCash = cashIn(toAssets);
  if (fromCash > teamCashM(fromTeam, state.settings) + 0.05) {
    return {
      ok: false,
      reason: `${fromTeam.abbr} does not have $${fromCash.toFixed(1)}M in cash.`,
      fromValue: 0,
      toValue: 0,
    };
  }
  if (toCash > teamCashM(toTeam, state.settings) + 0.05) {
    return {
      ok: false,
      reason: `${toTeam.abbr} does not have $${toCash.toFixed(1)}M in cash.`,
      fromValue: 0,
      toValue: 0,
    };
  }
  const receivedByFrom = toAssets
    .filter((asset) => asset.type === "pick")
    .map((asset) => allPicks.find((pick) => pick.id === asset.id))
    .filter((pick): pick is GmDraftPick => !!pick);
  const receivedByTo = fromAssets
    .filter((asset) => asset.type === "pick")
    .map((asset) => allPicks.find((pick) => pick.id === asset.id))
    .filter((pick): pick is GmDraftPick => !!pick);
  if (stepienViolation(fromTeam, fromAssets, receivedByFrom, state.season)) {
    return {
      ok: false,
      reason: `${fromTeam.abbr} would be out of first-round picks in consecutive years.`,
      fromValue: 0,
      toValue: 0,
    };
  }
  if (stepienViolation(toTeam, toAssets, receivedByTo, state.season)) {
    return {
      ok: false,
      reason: `${toTeam.abbr} would be out of first-round picks in consecutive years.`,
      fromValue: 0,
      toValue: 0,
    };
  }
  if (fromAssets.length > 9 || toAssets.length > 9) {
    return {
      ok: false,
      reason: "A team can include at most 9 assets.",
      fromValue: 0,
      toValue: 0,
    };
  }

  const fromValue = boardValue(state, toTeamId, fromAssets);
  const toValue = boardValue(state, toTeamId, toAssets);

  // Both piles are priced on the partner's board. A buyer or a seller
  // will give a little, and a club that is staying put will not.
  const partner = state.teams.find((t) => t.id === toTeamId)!;
  const shopping = (partner.tradeBlock ?? []).some((id) =>
    toAssets.some((asset) => asset.type === "player" && asset.id === id)
  );
  const stance = tradeStance(state, partner.id);
  const cushion = (stance === "stay" ? 3 : 8) + (shopping ? 8 : 0);
  if (fromValue + cushion < toValue) {
    return {
      ok: false,
      reason: `${partner.abbr} rejects: not enough value for them.`,
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

  const payCash = (fromId: string, toId: string, amount: number) => {
    if (amount <= 0) return;
    const sender = teams.find((t) => t.id === fromId)!;
    const receiver = teams.find((t) => t.id === toId)!;
    sender.cashM = teamCashM(sender, state.settings) - amount;
    receiver.cashM = teamCashM(receiver, state.settings) + amount;
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
    else if (a.type === "pick") movePick(a.id, proposal.toTeamId);
  }
  for (const a of proposal.toAssets) {
    if (a.type === "player") movePlayer(a.id, proposal.fromTeamId);
    else if (a.type === "pick") movePick(a.id, proposal.fromTeamId);
  }
  payCash(proposal.fromTeamId, proposal.toTeamId, cashIn(proposal.fromAssets));
  payCash(proposal.toTeamId, proposal.fromTeamId, cashIn(proposal.toAssets));
  for (const club of teams) {
    const roster = new Set(
      players.filter((p) => p.teamId === club.id).map((p) => p.id)
    );
    club.tradeBlock = (club.tradeBlock ?? []).filter((id) => roster.has(id));
    club.untouchables = (club.untouchables ?? []).filter((id) => roster.has(id));
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

export type PlayerPackage = {
  partnerId: string;
  youSend: GmTradeAsset[];
  youReceive: GmTradeAsset[];
};

function packageShape(assets: GmTradeAsset[]): string {
  const players = assets.filter((asset) => asset.type === "player").length;
  const picks = assets.filter((asset) => asset.type === "pick").length;
  const cash = assets.some((asset) => asset.type === "cash") ? "c" : "";
  return `${players}p${picks}k${cash}`;
}

/** Players, picks, and cash one club can put in a package. */
function clubBundles(state: GmLeagueState, teamId: string): GmTradeAsset[][] {
  const team = state.teams.find((entry) => entry.id === teamId);
  if (!team) return [];
  const blocked = new Set(team.untouchables ?? []);
  const players = state.players
    .filter((player) => player.teamId === teamId && player.contract && !blocked.has(player.id))
    .sort((a, b) => playerTradePoints(b) - playerTradePoints(a))
    .slice(0, 10);
  const picks = [...team.draftPicks]
    .sort((a, b) => a.season - b.season || a.round - b.round)
    .slice(0, 8);
  const limit = Math.min(cashLimitM(state.settings), teamCashM(team, state.settings));
  const cashChoices = [Math.min(3, limit), limit].filter(
    (amount, index, list) => amount > 0 && list.indexOf(amount) === index
  );
  const bundles: GmTradeAsset[][] = [];
  for (const player of players) bundles.push([{ type: "player", id: player.id }]);
  for (const pick of picks) bundles.push([{ type: "pick", id: pick.id }]);
  for (const player of players) {
    for (const pick of picks) {
      bundles.push([
        { type: "player", id: player.id },
        { type: "pick", id: pick.id },
      ]);
    }
    for (const amount of cashChoices) {
      bundles.push([
        { type: "player", id: player.id },
        { type: "cash", id: `cash-${amount}`, cashM: amount },
      ]);
    }
  }
  for (let i = 0; i < Math.min(players.length, 6); i += 1) {
    for (let j = i + 1; j < Math.min(players.length, 6); j += 1) {
      bundles.push([
        { type: "player", id: players[i]!.id },
        { type: "player", id: players[j]!.id },
      ]);
    }
  }
  return bundles;
}

/** Cheapest fair way for `fromTeamId` to land `targetPlayerId` from `toTeamId`. */
export function findTradePackage(
  state: GmLeagueState,
  fromTeamId: string,
  toTeamId: string,
  targetPlayerId: string
): GmTradeAsset[] | null {
  return packagesToAcquire(state, fromTeamId, toTeamId, targetPlayerId)[0]?.youSend ?? null;
}

function packagesToAcquire(
  state: GmLeagueState,
  fromTeamId: string,
  toTeamId: string,
  targetPlayerId: string
): PlayerPackage[] {
  const incoming: GmTradeAsset[] = [{ type: "player", id: targetPlayerId }];
  const bestByShape = new Map<string, { assets: GmTradeAsset[]; value: number }>();
  for (const outgoing of clubBundles(state, fromTeamId)) {
    const verdict = evaluateTrade(state, fromTeamId, toTeamId, outgoing, incoming);
    if (!verdict.ok) continue;
    const shape = packageShape(outgoing);
    const current = bestByShape.get(shape);
    if (!current || verdict.fromValue < current.value) {
      bestByShape.set(shape, { assets: outgoing, value: verdict.fromValue });
    }
  }
  return [...bestByShape.values()]
    .sort((a, b) => a.value - b.value)
    .slice(0, 4)
    .map((entry) => ({
      partnerId: toTeamId,
      youSend: entry.assets,
      youReceive: incoming,
    }));
}

/**
 * One checked player.
 * Yours: the best package each other club will still give up.
 * Theirs: packages your club can send that clear their board.
 * Empty when nothing is fair.
 */
export function findPlayerPackages(
  state: GmLeagueState,
  userTeamId: string,
  playerId: string
): PlayerPackage[] {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player?.teamId || !player.contract) return [];
  if (player.teamId !== userTeamId) {
    return packagesToAcquire(state, userTeamId, player.teamId, player.id);
  }

  const shopping: GmLeagueState = {
    ...state,
    teams: state.teams.map((team) =>
      team.id === userTeamId
        ? {
            ...team,
            untouchables: (team.untouchables ?? []).filter((id) => id !== player.id),
          }
        : team
    ),
  };
  const offered: GmTradeAsset[] = [{ type: "player", id: player.id }];
  const hits: PlayerPackage[] = [];
  for (const club of shopping.teams) {
    if (club.id === userTeamId || club.id.startsWith("as-")) continue;
    let best: GmTradeAsset[] | null = null;
    let bestValue = -1;
    for (const bundle of clubBundles(shopping, club.id)) {
      const verdict = evaluateTrade(shopping, userTeamId, club.id, offered, bundle);
      if (!verdict.ok || verdict.toValue <= bestValue) continue;
      bestValue = verdict.toValue;
      best = bundle;
    }
    if (best) {
      hits.push({ partnerId: club.id, youSend: offered, youReceive: best });
    }
  }
  hits.sort(
    (a, b) =>
      boardValue(shopping, b.partnerId, b.youReceive) -
      boardValue(shopping, a.partnerId, a.youReceive)
  );
  return hits.slice(0, 8);
}

function fairOutgoing(
  state: GmLeagueState,
  buyerId: string,
  sellerId: string,
  target: GmPlayer
): GmTradeAsset[] | null {
  const buyer = state.teams.find((team) => team.id === buyerId);
  if (!buyer) return null;
  const blocked = new Set(buyer.untouchables ?? []);
  const pieces = state.players
    .filter(
      (player) =>
        player.teamId === buyerId &&
        player.contract &&
        !blocked.has(player.id) &&
        player.ratings.impact < target.ratings.impact
    )
    .sort(
      (a, b) =>
        Math.abs((a.contract?.annualSalaryM ?? 0) - (target.contract?.annualSalaryM ?? 0)) -
        Math.abs((b.contract?.annualSalaryM ?? 0) - (target.contract?.annualSalaryM ?? 0))
    )
    .slice(0, 8);
  const incoming: GmTradeAsset[] = [{ type: "player", id: target.id }];
  let best: GmTradeAsset[] | null = null;
  let bestGap = Infinity;
  for (const piece of pieces) {
    const outgoing: GmTradeAsset[] = [{ type: "player", id: piece.id }];
    const verdict = evaluateTrade(state, buyerId, sellerId, outgoing, incoming);
    if (!verdict.ok) continue;
    if (verdict.fromValue < verdict.toValue - 6) continue;
    const gap = Math.abs(verdict.fromValue - verdict.toValue);
    if (gap < bestGap) {
      bestGap = gap;
      best = outgoing;
    }
  }
  return best;
}

/**
 * A few two-team deals the morning of the deadline.
 * The user's roster is left alone. Each deal still has to clear evaluateTrade.
 */
export function cpuDeadlineTrades(state: GmLeagueState): GmLeagueState {
  const ranked = state.teams
    .map((team) => {
      const row = state.standings[team.id];
      const wins = row?.wins ?? 0;
      const losses = row?.losses ?? 0;
      const played = wins + losses;
      return { team, pct: played > 0 ? wins / played : 0.5 };
    })
    .sort((a, b) => b.pct - a.pct);
  const buyers = ranked.filter((row) => row.team.id !== state.userTeamId).slice(0, 10);
  const sellers = ranked
    .filter((row) => row.team.id !== state.userTeamId)
    .slice(-10)
    .reverse();
  let next = state;
  const used = new Set<string>();
  let deals = 0;

  for (const seller of sellers) {
    if (deals >= 3) break;
    const target = next.players
      .filter(
        (player) =>
          player.teamId === seller.team.id &&
          player.contract &&
          (player.contract.yearsRemaining ?? 0) >= 1 &&
          !(seller.team.untouchables ?? []).includes(player.id) &&
          player.ratings.impact >= 0.8 &&
          (player.age >= 27 || player.contract.yearsRemaining <= 2)
      )
      .sort((a, b) => b.ratings.impact - a.ratings.impact)[0];
    if (!target) continue;

    for (const buyer of buyers) {
      if (used.has(buyer.team.id) || used.has(seller.team.id)) continue;
      if (buyer.team.id === seller.team.id) continue;
      const outgoing = fairOutgoing(next, buyer.team.id, seller.team.id, target);
      if (!outgoing) continue;
      const sent = next.players.find((player) => player.id === outgoing[0]?.id);
      next = applyTrade(next, {
        fromTeamId: buyer.team.id,
        toTeamId: seller.team.id,
        fromAssets: outgoing,
        toAssets: [{ type: "player", id: target.id }],
        status: "accepted",
      });
      const headline = `${buyer.team.city} acquires ${target.name}`;
      const body = sent
        ? `${seller.team.city} sends him for ${sent.name}.`
        : `${seller.team.city} moves him before the deadline.`;
      next = {
        ...next,
        news: next.news.map((item, index) =>
          index === 0 ? { ...item, headline, body } : item
        ),
        teams: next.teams.map((team) =>
          team.id === buyer.team.id || team.id === seller.team.id
            ? autoSetLineup(team, next.players)
            : team
        ),
      };
      used.add(buyer.team.id);
      used.add(seller.team.id);
      deals += 1;
      break;
    }
  }
  return next;
}
