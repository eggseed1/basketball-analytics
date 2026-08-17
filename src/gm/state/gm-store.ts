"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";
import type {
  GmLeagueState,
  GmPosition,
  GmTradeAsset,
} from "@/gm/types";
import { createGeneratedLeague } from "@/gm/seed/create-league";
import { simulateGame } from "@/gm/engine/simulate";
import {
  maxScheduleDay,
  generateSchedule,
  regularSeasonComplete,
} from "@/gm/engine/schedule";
import { applyTrade, evaluateTrade } from "@/gm/engine/trades";
import {
  advanceDraftPastAi,
  developPlayers,
  finishDraftWithAi,
  rollGameInjuries,
  runDraftPick,
  tickInjuries,
} from "@/gm/engine/progression";
import {
  ensureProspectIdentities,
  revealScouting,
  sealProspect,
  staffScoutContext,
} from "@/gm/engine/scouting";
import { generateScoutMarket } from "@/gm/seed/scouts";
import { autoSetLineup } from "@/gm/engine/lineup";
import { createRng, uid } from "@/gm/engine/rng";
import {
  applyGameToStandings,
  buildPlayoffBracket,
  computeLotteryOrder,
  emptyStandings,
} from "@/gm/engine/standings";
import { useMyLeagueStore } from "@/gm/myleague/store";

const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const value = await get<string>(name);
    return value ?? null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

interface GmStore {
  league: GmLeagueState | null;
  hydrated: boolean;
  seeding: boolean;
  seedError: string | null;
  setHydrated: (v: boolean) => void;
  /** Real NBA rosters (async). */
  newLeague: (userTeamId?: string, season?: string) => Promise<void>;
  /** Synthetic fallback (offline / demo). */
  newGeneratedLeague: (userTeamId?: string) => void;
  resetLeague: () => void;
  setStarter: (position: GmPosition, playerId: string | null) => void;
  autoLineup: () => void;
  simulateNextGame: () => string | null;
  simulateDay: () => void;
  simulateToDate: (day: number) => void;
  simulateToPlayoffs: () => void;
  proposeTrade: (
    toTeamId: string,
    fromAssets: GmTradeAsset[],
    toAssets: GmTradeAsset[]
  ) => { ok: boolean; reason?: string };
  draftPlayer: (playerId: string) => void;
  advanceToPlayoffs: () => void;
  simPlayoffDay: () => void;
  runOffseason: () => void;
  signFreeAgent: (playerId: string, salaryM: number, years: number) => void;
  waivePlayer: (playerId: string) => void;
  upgradeStaff: (kind: "scout" | "trainer") => void;
  /** Hire a director of scouting from the market (replaces current). */
  hireScout: (scoutId: string) => void;
  /** Refresh the available scout market. */
  refreshScoutMarket: () => void;
}

function withUpdate(league: GmLeagueState): GmLeagueState {
  return { ...league, updatedAt: new Date().toISOString() };
}

function syncMyLeague(league: GmLeagueState) {
  useMyLeagueStore.getState().syncFromLeague(league);
}

function myLeagueAllowsSim(league: GmLeagueState): boolean {
  const ml = useMyLeagueStore.getState();
  if (!ml.simulation) return true;
  ml.syncFromLeague(league);
  return ml.canSimulate().ok;
}

export const useGmStore = create<GmStore>()(
  persist(
    (set, get) => ({
      league: null,
      hydrated: false,
      seeding: false,
      seedError: null,
      setHydrated: (v) => set({ hydrated: v }),

      newLeague: async (userTeamId = "bos", season) => {
        set({ seeding: true, seedError: null });
        try {
          const res = await fetch("/api/gm/league", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userTeamId, season }),
          });
          const payload = (await res.json()) as {
            league?: GmLeagueState;
            snapshot?: import("@/gm/myleague/types").HistoricalSeasonSnapshot;
            seasonCanonical?: string;
            error?: string;
          };
          if (!res.ok || !payload.league) {
            throw new Error(payload.error ?? `Seed failed (${res.status})`);
          }
          set({ league: payload.league, seeding: false, seedError: null });
          useMyLeagueStore.getState().bootstrap(
            payload.league,
            {
              mode: "historical_replay",
              startEra: "latest",
              startSeason: payload.league.season,
              historicalAccuracy: 0.85,
              realDataProviderId: "espn+darko+lebron",
            },
            { snapshot: payload.snapshot }
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to load real rosters";
          set({ seeding: false, seedError: message });
          // Fallback so the user can still play.
          const league = createGeneratedLeague({ userTeamId });
          set({ league });
          useMyLeagueStore.getState().bootstrap(league);
        }
      },

      newGeneratedLeague: (userTeamId = "bos") => {
        const league = createGeneratedLeague({ userTeamId });
        set({ league, seedError: null });
        useMyLeagueStore.getState().bootstrap(league);
      },

      resetLeague: () => {
        useMyLeagueStore.getState().reset();
        set({ league: null, seedError: null });
      },

      setStarter: (position, playerId) => {
        const league = get().league;
        if (!league) return;
        const teams = league.teams.map((t) => {
          if (t.id !== league.userTeamId) return t;
          const starters = { ...t.starters, [position]: playerId };
          let benchOrder = t.benchOrder.filter((id) => id !== playerId);
          // demote previous starter to bench
          const prev = t.starters[position];
          if (prev && prev !== playerId) benchOrder = [prev, ...benchOrder];
          return { ...t, starters, benchOrder };
        });
        set({ league: withUpdate({ ...league, teams }) });
      },

      autoLineup: () => {
        const league = get().league;
        if (!league) return;
        const teams = league.teams.map((t) =>
          t.id === league.userTeamId ? autoSetLineup(t, league.players) : t
        );
        set({ league: withUpdate({ ...league, teams }) });
      },

      simulateNextGame: () => {
        const league = get().league;
        if (!league || league.phase !== "regular") return null;
        if (!myLeagueAllowsSim(league)) return null;
        const next = league.schedule.find(
          (g) =>
            !g.played &&
            (g.homeTeamId === league.userTeamId ||
              g.awayTeamId === league.userTeamId) &&
            g.day >= league.day
        );
        if (!next) return null;

        // Play all games up to this game's day for other teams first
        let state = { ...league };
        const due = state.schedule.filter(
          (g) => !g.played && g.day <= next.day
        );
        let standings = { ...state.standings };
        let players = [...state.players];
        let schedule = [...state.schedule];
        let boxScores = [...state.boxScores];
        let news = [...state.news];
        let userBoxId: string | null = null;

        for (const g of due.sort((a, b) => a.day - b.day || a.id.localeCompare(b.id))) {
          const result = simulateGame(g, state.teams, players);
          schedule = schedule.map((x) => (x.id === g.id ? result.game : x));
          boxScores = [result.box, ...boxScores].slice(0, 400);
          standings = applyGameToStandings(
            standings,
            state.teams,
            g.homeTeamId,
            g.awayTeamId,
            result.game.homeScore!,
            result.game.awayScore!
          );
          const ids = result.box.players.map((p) => p.playerId);
          players = rollGameInjuries(
            { ...state, players },
            ids,
            g.day * 99 + g.id.length
          );
          const homeTrainer =
            state.teams.find((t) => t.id === g.homeTeamId)?.staff.trainerLevel ??
            1;
          const awayTrainer =
            state.teams.find((t) => t.id === g.awayTeamId)?.staff.trainerLevel ??
            1;
          players = tickInjuries(
            players,
            Math.max(homeTrainer, awayTrainer)
          );
          if (g.id === next.id) userBoxId = result.box.id;
          if (
            g.homeTeamId === league.userTeamId ||
            g.awayTeamId === league.userTeamId
          ) {
            news = [
              {
                id: uid("news"),
                day: g.day,
                season: state.season,
                headline: `${result.game.awayTeamId.toUpperCase()} ${result.game.awayScore} @ ${result.game.homeTeamId.toUpperCase()} ${result.game.homeScore}`,
                body: "Full traditional + advanced box score available.",
                tone: ((g.homeTeamId === league.userTeamId &&
                  (result.game.homeScore ?? 0) >
                    (result.game.awayScore ?? 0)) ||
                (g.awayTeamId === league.userTeamId &&
                  (result.game.awayScore ?? 0) >
                    (result.game.homeScore ?? 0))
                  ? "good"
                  : "bad") as "good" | "bad",
              },
              ...news,
            ].slice(0, 50);
          }
        }

        state = withUpdate({
          ...state,
          day: next.day,
          schedule,
          standings,
          players,
          boxScores,
          news,
        });
        set({ league: state });
        syncMyLeague(state);
        if (regularSeasonComplete(schedule)) get().advanceToPlayoffs();
        return userBoxId;
      },

      simulateDay: () => {
        const league = get().league;
        if (!league || league.phase !== "regular") return;
        if (!myLeagueAllowsSim(league)) return;
        const day = league.day;
        const due = league.schedule.filter((g) => !g.played && g.day === day);
        if (!due.length) {
          const nextDay = league.day + 1;
          const maxDay = maxScheduleDay(league.schedule);
          if (nextDay > maxDay || regularSeasonComplete(league.schedule)) {
            get().advanceToPlayoffs();
            return;
          }
          set({
            league: withUpdate({ ...league, day: nextDay }),
          });
          return;
        }

        let standings = { ...league.standings };
        let players = [...league.players];
        let schedule = [...league.schedule];
        let boxScores = [...league.boxScores];
        const trainer =
          league.teams.find((t) => t.id === league.userTeamId)?.staff
            .trainerLevel ?? 1;

        for (const g of due) {
          const result = simulateGame(g, league.teams, players);
          schedule = schedule.map((x) => (x.id === g.id ? result.game : x));
          boxScores = [result.box, ...boxScores].slice(0, 400);
          standings = applyGameToStandings(
            standings,
            league.teams,
            g.homeTeamId,
            g.awayTeamId,
            result.game.homeScore!,
            result.game.awayScore!
          );
          players = rollGameInjuries(
            { ...league, players },
            result.box.players.map((p) => p.playerId),
            g.day * 99 + g.id.length
          );
        }
        players = tickInjuries(players, trainer);

        const maxDay = maxScheduleDay(schedule);
        const nextState = withUpdate({
          ...league,
          schedule,
          standings,
          players,
          boxScores,
          day: Math.min(day + 1, maxDay + 1),
        });
        set({ league: nextState });
        syncMyLeague(nextState);
        if (regularSeasonComplete(schedule)) get().advanceToPlayoffs();
      },

      simulateToDate: (targetDay) => {
        const league = get().league;
        if (!league) return;
        let guard = 0;
        while ((get().league?.day ?? 0) < targetDay && guard < 400) {
          get().simulateDay();
          guard += 1;
          if (get().league?.phase !== "regular") break;
        }
      },

      simulateToPlayoffs: () => {
        if (!get().league || get().league?.phase !== "regular") return;
        let guard = 0;
        while (get().league?.phase === "regular" && guard < 500) {
          get().simulateDay();
          guard += 1;
        }
      },

      proposeTrade: (toTeamId, fromAssets, toAssets) => {
        const league = get().league;
        if (!league) return { ok: false, reason: "No league" };
        const evaluation = evaluateTrade(
          league,
          league.userTeamId,
          toTeamId,
          fromAssets,
          toAssets
        );
        if (!evaluation.ok) return evaluation;
        const next = applyTrade(league, {
          fromTeamId: league.userTeamId,
          toTeamId,
          fromAssets,
          toAssets,
        });
        set({ league: next });
        return { ok: true };
      },

      draftPlayer: (playerId) => {
        const league = get().league;
        if (!league || league.phase !== "draft") return;
        const order = league.lotteryOrder ?? [];
        const idx = league.draftPickIndex ?? 0;
        const onClock = order[idx % Math.max(1, order.length)];
        if (onClock && onClock !== league.userTeamId) return;
        let next = runDraftPick(league, league.userTeamId, playerId);
        next = advanceDraftPastAi(next);
        set({ league: withUpdate(next) });
      },

      advanceToPlayoffs: () => {
        const league = get().league;
        if (
          !league ||
          league.phase === "playoffs" ||
          league.phase === "draft" ||
          league.phase === "offseason"
        )
          return;
        const bracket = buildPlayoffBracket(league);
        const lotteryOrder = computeLotteryOrder(league);
        const next = withUpdate({
          ...league,
          phase: "playoffs",
          playoffBracket: bracket,
          lotteryOrder,
          draftPickIndex: 0,
          news: [
            {
              id: uid("news"),
              day: league.day,
              season: league.season,
              headline: "Playoffs begin",
              body: "Conference brackets are set. Lottery teams await the draft order.",
              tone: "info" as const,
            },
            ...league.news,
          ].slice(0, 50),
        });
        set({ league: next });
        syncMyLeague(next);
      },

      simPlayoffDay: () => {
        const league = get().league;
        if (!league?.playoffBracket) return;
        let bracket = league.playoffBracket.map((s) => ({ ...s }));
        let standings = league.standings;
        let schedule = [...league.schedule];
        let boxScores = [...league.boxScores];
        let players = league.players;

        for (const series of bracket) {
          if (series.done) continue;
          const game = {
            id: uid("pg"),
            season: league.season,
            day: league.day,
            homeTeamId: series.winsA >= series.winsB ? series.teamAId : series.teamBId,
            awayTeamId: series.winsA >= series.winsB ? series.teamBId : series.teamAId,
            played: false,
          };
          const result = simulateGame(game, league.teams, players);
          schedule.push(result.game);
          boxScores = [result.box, ...boxScores].slice(0, 400);
          const homeWin =
            (result.game.homeScore ?? 0) > (result.game.awayScore ?? 0);
          if (homeWin) {
            if (result.game.homeTeamId === series.teamAId) series.winsA += 1;
            else series.winsB += 1;
          } else {
            if (result.game.awayTeamId === series.teamAId) series.winsA += 1;
            else series.winsB += 1;
          }
          if (series.winsA >= 4 || series.winsB >= 4) {
            series.done = true;
            series.winnerId =
              series.winsA >= 4 ? series.teamAId : series.teamBId;
          }
          void standings;
        }

        const roundDone = bracket
          .filter((s) => s.round === Math.max(...bracket.map((b) => b.round)))
          .every((s) => s.done);

        if (roundDone) {
          const currentRound = Math.max(...bracket.map((b) => b.round));
          const winners = bracket
            .filter((s) => s.round === currentRound && s.winnerId)
            .map((s) => s.winnerId!);
          if (currentRound === 1) {
            // conf semis
            for (const conf of ["East", "West"] as const) {
              const confW = bracket
                .filter((s) => s.round === 1 && s.conf === conf)
                .map((s) => s.winnerId!);
              for (let i = 0; i < confW.length; i += 2) {
                if (confW[i] && confW[i + 1]) {
                  bracket.push({
                    id: uid("series"),
                    round: 2,
                    conf,
                    teamAId: confW[i]!,
                    teamBId: confW[i + 1]!,
                    winsA: 0,
                    winsB: 0,
                    done: false,
                  });
                }
              }
            }
          } else if (currentRound === 2) {
            for (const conf of ["East" as const, "West" as const]) {
              const confW = bracket
                .filter((s) => s.round === 2 && s.conf === conf)
                .map((s) => s.winnerId!);
              if (confW[0] && confW[1]) {
                bracket.push({
                  id: uid("series"),
                  round: 3,
                  conf,
                  teamAId: confW[0],
                  teamBId: confW[1],
                  winsA: 0,
                  winsB: 0,
                  done: false,
                });
              }
            }
          } else if (currentRound === 3) {
            const east = bracket.find(
              (s) => s.round === 3 && s.conf === "East" && s.winnerId
            );
            const west = bracket.find(
              (s) => s.round === 3 && s.conf === "West" && s.winnerId
            );
            if (east?.winnerId && west?.winnerId) {
              bracket.push({
                id: uid("series"),
                round: 4,
                conf: "Finals",
                teamAId: east.winnerId,
                teamBId: west.winnerId,
                winsA: 0,
                winsB: 0,
                done: false,
              });
            }
          } else if (currentRound === 4) {
            let drafted = withUpdate({
              ...league,
              phase: "draft" as const,
              playoffBracket: bracket,
              schedule,
              boxScores,
              players,
              draftPickIndex: 0,
              lotteryOrder: league.lotteryOrder ?? computeLotteryOrder(league),
              news: [
                {
                  id: uid("news"),
                  day: league.day,
                  season: league.season,
                  headline: "Champions crowned - draft is next",
                  body: "The Finals are over. Lottery order is locked. Make your selection.",
                  tone: "good" as const,
                },
                ...league.news,
              ].slice(0, 50),
            });
            drafted = advanceDraftPastAi(drafted);
            set({ league: drafted });
            syncMyLeague(drafted);
            return;
          }
          void winners;
        }

        const playoffState = withUpdate({
          ...league,
          playoffBracket: bracket,
          schedule,
          boxScores,
          players,
          day: league.day + 1,
        });
        set({ league: playoffState });
        syncMyLeague(playoffState);
      },

      runOffseason: () => {
        const league = get().league;
        if (!league) return;

        const working =
          league.phase === "draft" && league.draftPool.length
            ? finishDraftWithAi(league)
            : league;

        const players = developPlayers(working.players, true).map((p) => {
          if (p.contract && p.contract.yearsRemaining <= 0) {
            return { ...p, teamId: null, contract: null };
          }
          return p;
        });
        const freeAgents = players
          .filter((p) => p.teamId === null)
          .map((p) => p.id);
        const teams = working.teams.map((t) => autoSetLineup(t, players));
        const season = working.season + 1;
        const fresh = createGeneratedLeague({
          userTeamId: working.userTeamId,
          season,
          seed: season * 997,
        });
        const prospectIds = fresh.draftPool;
        const { scout: userScout, level: userLevel } = staffScoutContext(working);
        const rng = createRng(season * 9973);
        const prospects = fresh.players
          .filter((p) => prospectIds.includes(p.id))
          .map((p, i) =>
            sealProspect(p, userLevel, i, rng, userScout)
          );
        const mergedPlayers = [
          ...players.filter((p) => !working.draftPool.includes(p.id)),
          ...prospects,
        ];

        set({
          league: withUpdate({
            ...working,
            season,
            day: 0,
            phase: "regular",
            players: mergedPlayers,
            freeAgents,
            teams,
            schedule: generateSchedule(teams, season, season * 997),
            standings: emptyStandings(teams),
            boxScores: [],
            playoffBracket: undefined,
            draftPool: prospectIds,
            scoutMarket: fresh.scoutMarket ?? working.scoutMarket,
            lotteryOrder: undefined,
            draftPickIndex: 0,
            news: [
              {
                id: uid("news"),
                day: 0,
                season,
                headline: `${season - 1}-${String(season).slice(-2)} tips off`,
                body: "Contracts ticked, players aged/developed, new schedule locked.",
                tone: "info" as const,
              },
            ],
            tradeLog: [],
          }),
        });
        const next = get().league;
        if (next) {
          // New season → fresh Reality placeholder + Simulation branch.
          useMyLeagueStore.getState().bootstrap(next);
        }
      },

      signFreeAgent: (playerId, salaryM, years) => {
        const league = get().league;
        if (!league) return;
        const players = league.players.map((p) =>
          p.id === playerId
            ? {
                ...p,
                teamId: league.userTeamId,
                contract: {
                  yearsRemaining: years,
                  annualSalaryM: salaryM,
                  birdRights: "none" as const,
                  signedSeason: league.season,
                },
              }
            : p
        );
        const teams = league.teams.map((t) =>
          t.id === league.userTeamId
            ? { ...t, benchOrder: [...t.benchOrder, playerId] }
            : t
        );
        set({
          league: withUpdate({
            ...league,
            players,
            teams,
            freeAgents: league.freeAgents.filter((id) => id !== playerId),
          }),
        });
      },

      waivePlayer: (playerId) => {
        const league = get().league;
        if (!league) return;
        const players = league.players.map((p) =>
          p.id === playerId ? { ...p, teamId: null } : p
        );
        const teams = league.teams.map((t) => {
          if (t.id !== league.userTeamId) return t;
          const starters = { ...t.starters };
          for (const pos of Object.keys(starters) as GmPosition[]) {
            if (starters[pos] === playerId) starters[pos] = null;
          }
          return {
            ...t,
            starters,
            benchOrder: t.benchOrder.filter((id) => id !== playerId),
          };
        });
        set({
          league: withUpdate({
            ...league,
            players,
            teams,
            freeAgents: [...league.freeAgents, playerId],
          }),
        });
      },

      upgradeStaff: (kind) => {
        const league = get().league;
        if (!league) return;
        if (kind === "scout") {
          // Legacy button - bump eye on hired scout instead of opaque level.
          const teams = league.teams.map((t) => {
            if (t.id !== league.userTeamId) return t;
            const scout = t.staff.scout
              ? {
                  ...t.staff.scout,
                  eye: Math.min(5, t.staff.scout.eye + 1),
                  yearsExperience: t.staff.scout.yearsExperience + 1,
                }
              : t.staff.scout;
            return {
              ...t,
              staff: {
                ...t.staff,
                scout,
                scoutLevel: scout?.eye ?? Math.min(5, t.staff.scoutLevel + 1),
              },
            };
          });
          const { scout, level } = staffScoutContext({ ...league, teams });
          const players = revealScouting(
            league.players,
            league.userTeamId,
            level,
            league.draftPool,
            scout
          );
          set({ league: withUpdate({ ...league, teams, players }) });
          return;
        }
        const teams = league.teams.map((t) => {
          if (t.id !== league.userTeamId) return t;
          return {
            ...t,
            staff: {
              ...t.staff,
              trainerLevel: Math.min(5, t.staff.trainerLevel + 1),
            },
          };
        });
        set({ league: withUpdate({ ...league, teams }) });
      },

      hireScout: (scoutId) => {
        const league = get().league;
        if (!league) return;
        const market = league.scoutMarket ?? [];
        const hired = market.find((s) => s.id === scoutId);
        if (!hired) return;
        const teams = league.teams.map((t) => {
          if (t.id !== league.userTeamId) return t;
          return {
            ...t,
            staff: {
              ...t.staff,
              scout: hired,
              scoutLevel: hired.eye,
            },
          };
        });
        const remaining = market.filter((s) => s.id !== scoutId);
        const { scout, level } = staffScoutContext({ ...league, teams });
        const players = revealScouting(
          league.players,
          league.userTeamId,
          level,
          league.draftPool,
          scout
        );
        set({
          league: withUpdate({
            ...league,
            teams,
            players,
            scoutMarket: remaining,
            news: [
              {
                id: uid("news"),
                day: league.day,
                season: league.season,
                headline: `Hired ${hired.name} as director of scouting`,
                body: `${hired.yearsExperience} years · ${hired.expertise} specialist · eye ${hired.eye}/5. Draft fog re-rolled to their board.`,
                tone: "info" as const,
              },
              ...league.news,
            ].slice(0, 50),
          }),
        });
      },

      refreshScoutMarket: () => {
        const league = get().league;
        if (!league) return;
        set({
          league: withUpdate({
            ...league,
            scoutMarket: generateScoutMarket(
              league.season * 8881 + league.day * 13 + (league.scoutMarket?.length ?? 0),
              5
            ),
          }),
        });
      },
    }),
    {
      name: "franchise-lab-gm",
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({ league: s.league }),
      onRehydrateStorage: () => (state) => {
        if (state?.league) {
          state.league = ensureProspectIdentities(state.league);
        }
        state?.setHydrated(true);
      },
    }
  )
);
