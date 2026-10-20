/**
 * Contract options desk. Team options are a club decision. Player options
 * are simulated — the user cannot pick another person's option.
 */

import type { GmFaDecision, GmLeagueState, GmPlayer } from "@/gm/types";
import { overallOf } from "@/gm/engine/lineup";
import { hasPendingOption } from "@/gm/engine/fa-status";
import { createRng, uid } from "@/gm/engine/rng";

export type OptionRow = {
  player: GmPlayer;
  control: "team" | "player";
  salaryM: number;
  teamId: string;
  decided?: "exercise" | "decline";
};

export function pendingOptions(state: GmLeagueState): OptionRow[] {
  return state.players
    .filter(hasPendingOption)
    .map((player) => ({
      player,
      control: player.contract!.option === "player" ? ("player" as const) : ("team" as const),
      salaryM: player.contract!.annualSalaryM,
      teamId: player.teamId!,
    }));
}

function releaseToMarket(player: GmPlayer, fromTeamId: string): GmPlayer {
  const contract = player.contract!;
  const rights =
    contract.birdRights === "bird" || contract.birdRights === "early"
      ? contract.birdRights
      : null;
  return {
    ...player,
    teamId: null,
    contract: null,
    rightsTeamId: rights ? fromTeamId : null,
    rightsKind: rights ?? undefined,
    lastSalaryM: rights ? contract.annualSalaryM : undefined,
  };
}

function exerciseOption(player: GmPlayer): GmPlayer {
  return {
    ...player,
    contract: {
      ...player.contract!,
      yearsRemaining: 1,
      option: null,
    },
  };
}

/** Whether a team should pick up this option (CPU policy). */
export function cpuShouldExerciseTeamOption(player: GmPlayer): boolean {
  return overallOf(player) >= 74;
}

/** Whether the player exercises his own option. */
export function simulatePlayerOption(player: GmPlayer): "exercise" | "decline" {
  // Stars walk into the market; rotation guys take the year.
  return overallOf(player) >= 81 ? "decline" : "exercise";
}

export function applyOptionDecision(
  state: GmLeagueState,
  playerId: string,
  decision: "exercise" | "decline"
): GmLeagueState {
  const player = state.players.find((row) => row.id === playerId);
  if (!player || !hasPendingOption(player)) return state;
  const teamId = player.teamId!;
  const control = player.contract!.option;
  // User cannot decide another person's player option.
  if (control === "player") return state;
  // Only the rights club (user) exercises team options through this path.
  if (control !== "team" || teamId !== state.userTeamId) return state;

  const nextPlayer =
    decision === "exercise" ? exerciseOption(player) : releaseToMarket(player, teamId);
  const players = state.players.map((row) => (row.id === playerId ? nextPlayer : row));
  const freeAgents =
    decision === "decline"
      ? [...new Set([...state.freeAgents, playerId])]
      : state.freeAgents;
  const decisionRow: GmFaDecision = {
    id: uid("fadec"),
    kind: "team_option",
    playerId,
    teamId,
    headline:
      decision === "exercise"
        ? `Team option picked up on ${player.name}`
        : `Team option declined on ${player.name}`,
    detail:
      decision === "exercise"
        ? `${player.name} returns for $${player.contract!.annualSalaryM.toFixed(1)}M.`
        : `${player.name} hits the market.`,
  };
  const decisions: GmFaDecision[] = [
    decisionRow,
    ...(state.faMarket?.decisions ?? []),
  ].slice(0, 40);

  return {
    ...state,
    players,
    freeAgents,
    faMarket: state.faMarket
      ? { ...state.faMarket, decisions }
      : state.faMarket,
  };
}

/** Resolve all player options (simulated) and CPU team options. */
export function resolveAutomatedOptions(state: GmLeagueState): GmLeagueState {
  const rng = createRng((state.faMarket?.seed ?? state.season * 13) + 17);
  let next = state;
  const lines: string[] = [];
  for (const row of pendingOptions(next)) {
    if (row.control === "player") {
      const decision = simulatePlayerOption(row.player);
      const players = next.players.map((player) => {
        if (player.id !== row.player.id) return player;
        return decision === "exercise"
          ? exerciseOption(player)
          : releaseToMarket(player, row.teamId);
      });
      const freeAgents =
        decision === "decline"
          ? [...new Set([...next.freeAgents, row.player.id])]
          : next.freeAgents;
      next = { ...next, players, freeAgents };
      lines.push(
        decision === "exercise"
          ? `${row.player.name} exercises his player option ($${row.salaryM.toFixed(1)}M).`
          : `${row.player.name} declines his player option and hits free agency.`
      );
      continue;
    }
    // Team option: user club waits unless automation; CPU decides now.
    if (row.teamId === next.userTeamId) continue;
    const exercise = cpuShouldExerciseTeamOption(row.player) && rng() > 0.08;
    const players = next.players.map((player) => {
      if (player.id !== row.player.id) return player;
      return exercise
        ? exerciseOption(player)
        : releaseToMarket(player, row.teamId);
    });
    const freeAgents = exercise
      ? next.freeAgents
      : [...new Set([...next.freeAgents, row.player.id])];
    next = { ...next, players, freeAgents };
    if (overallOf(row.player) >= 76) {
      lines.push(
        exercise
          ? `${next.teams.find((t) => t.id === row.teamId)?.abbr ?? "Club"} picks up ${row.player.name}'s team option.`
          : `${next.teams.find((t) => t.id === row.teamId)?.abbr ?? "Club"} declines ${row.player.name}'s team option.`
      );
    }
  }

  const decisions: GmFaDecision[] = [
    ...lines.map((line) => ({
      id: uid("fadec"),
      kind: "player_option_result" as const,
      playerId: "",
      headline: line,
      detail: line,
    })),
    ...(next.faMarket?.decisions ?? []),
  ].slice(0, 40);

  return {
    ...next,
    faMarket: next.faMarket
      ? {
          ...next.faMarket,
          decisions,
          dayRecap: [...lines, ...(next.faMarket.dayRecap ?? [])].slice(0, 20),
          recap: [...lines, ...(next.faMarket.recap ?? [])].slice(0, 40),
        }
      : next.faMarket,
  };
}

/** User team options still waiting — Advance Day should stop. */
export function userTeamOptionsBlocking(state: GmLeagueState): OptionRow[] {
  return pendingOptions(state).filter(
    (row) => row.control === "team" && row.teamId === state.userTeamId
  );
}

/** Force-resolve remaining user team options with CPU policy (automation). */
export function resolveUserTeamOptionsWithPolicy(state: GmLeagueState): GmLeagueState {
  let next = state;
  for (const row of userTeamOptionsBlocking(next)) {
    const decision = cpuShouldExerciseTeamOption(row.player) ? "exercise" : "decline";
    const players = next.players.map((player) => {
      if (player.id !== row.player.id) return player;
      return decision === "exercise"
        ? exerciseOption(player)
        : releaseToMarket(player, row.teamId);
    });
    const freeAgents =
      decision === "decline"
        ? [...new Set([...next.freeAgents, row.player.id])]
        : next.freeAgents;
    next = { ...next, players, freeAgents };
  }
  return next;
}
