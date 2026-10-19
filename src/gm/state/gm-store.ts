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
import { recordSimGame } from "@/gm/lib/season-line";
import { ensurePlayerSheet } from "@/gm/engine/attributes";
import { applyRookieRatings } from "@/gm/engine/rookie-ratings";
import { applyRealBooks } from "@/gm/seed/real-books";
import {
  applyDraftNightTrade,
  draftNightOffers,
  ensureDraftOrder,
  expandDraftOrder,
  moveBoard,
  orderedBoard,
  pickOwnerAt,
  type DraftNightOffer,
} from "@/gm/engine/draft-room";
import { userGamesPlayed } from "@/gm/lib/selectors";
import { buildDigest, newInjuries, stepDay } from "@/gm/engine/pace";
import { cupChampionNews, ensureNbaCup, gameCounts } from "@/gm/engine/cup";
import { allStarChampionNews, ensureAllStar } from "@/gm/engine/allstar";
import { stampSeasonAwards } from "@/gm/engine/awards";
import {
  adoptRealSchedule,
  regularSeasonComplete,
  tradeDeadlineDate,
  tradeDeadlineDay,
} from "@/gm/engine/schedule";
import { applyTrade, evaluateTrade } from "@/gm/engine/trades";
import { considerIncomingOffer, offerIsFair } from "@/gm/engine/offers";
import {
  advanceDraftPastAi,
  advanceOneDraftPick,
  finishDraftWithAi,
  rollGameInjuries,
  runDraftPick,
  tickInjuries,
} from "@/gm/engine/progression";
import {
  automationOf,
  enterFreeAgency,
  noteTradeDeadline,
  runCpuFreeAgency,
  startNextSeason,
} from "@/gm/engine/offseason";
import {
  advanceFaDay as advanceFaDayEngine,
  resignOwnFreeAgent as resignOwnFreeAgentEngine,
  userOfferFreeAgent,
} from "@/gm/engine/free-agency";
import {
  applyCombine,
  ensureProspectIdentities,
  revealScouting,
  sealProspect,
  staffScoutContext,
} from "@/gm/engine/scouting";
import { generateScoutMarket } from "@/gm/seed/scouts";
import { autoSetLineup } from "@/gm/engine/lineup";
import { capStatus } from "@/gm/engine/cap";
import { asAssociate, hireQuote, withAssociate, withHeadCoach } from "@/gm/engine/staff";
import { installStaff, openCoachMarket, TRAINER_TIERS } from "@/gm/seed/coaches";
import { claimOpeningRosters } from "@/gm/seed/opening-roster";
import { coachingOf, shiftSnapshot, suggestedMinutes } from "@/gm/engine/coaching";
import type { GmCoaching } from "@/gm/types";
import { uid, clamp } from "@/gm/engine/rng";
import {
  applyGameToStandings,
  betterRecord,
  buildPlayoffBracket,
  computeLotteryOrder,
  emptyStandings,
  seriesHosts,
} from "@/gm/engine/standings";
import {
  applyPlayInResult,
  createPlayInBoard,
  playInDone,
  playInOpenGames,
  playoffSeeds,
  playoffTeamIdSet,
  teamName,
} from "@/gm/engine/play-in";
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
  setCoaching: (patch: Partial<GmCoaching>) => void;
  setRotationMinutes: (playerId: string, minutes: number) => void;
  resetRotation: () => void;
  simulateNextGame: () => string | null;
  simulateDay: () => void;
  simulateToDate: (day: number) => void;
  simulateToPlayoffs: () => void;
  /** Skip ahead and leave a short recap. */
  skipAhead: (kind: "week" | "deadline" | "season") => void;
  /** Walk the calendar one day at a time. */
  startAutoSim: (kind: "day" | "next" | "week" | "deadline" | "season") => void;
  stopAutoSim: () => void;
  simRun: null | {
    kind: "day" | "next" | "week" | "deadline" | "season";
    startPlayed: number;
    deadlineDay: number;
    winsBefore: number;
    lossesBefore: number;
    notable: GmLeagueState["boxScores"];
  };
  finishPlayoffRound: () => void;
  simRestOfPlayoffs: () => void;
  simPlayInNight: () => void;
  finishPlayIn: () => void;
  acceptIncomingOffer: (
    fromAssets: GmTradeAsset[],
    toAssets: GmTradeAsset[]
  ) => { ok: boolean; reason?: string };
  declineIncomingOffer: () => void;
  proposeTrade: (
    toTeamId: string,
    fromAssets: GmTradeAsset[],
    toAssets: GmTradeAsset[]
  ) => { ok: boolean; reason?: string };
  setTradeStatus: (
    playerId: string,
    status: "open" | "block" | "untouchable"
  ) => void;
  setPickProtection: (pickId: string, topN: number | null) => void;
  draftPlayer: (playerId: string) => void;
  /** Sim the next CPU pick only. Stops when you are on the clock. */
  simDraftPick: () => void;
  /** Walk CPU picks until your next selection. */
  simDraftToUser: () => void;
  acceptDraftNightTrade: (offer: DraftNightOffer) => void;
  moveDraftBoard: (playerId: string, dir: "up" | "down" | "top") => void;
  resetDraftBoard: () => void;
  runCombine: () => void;
  advanceToPlayoffs: () => void;
  simPlayoffDay: () => void;
  /** Draft still open: open free agency. Free agency: tip off the next year. */
  runOffseason: () => void;
  openFreeAgency: () => void;
  runCpuSignings: () => void;
  /** Advance one day on the free-agency clock (moratorium → open → fill). */
  advanceFaDay: () => void;
  /** Bird / early-Bird re-sign at the ask. */
  resignOwnFreeAgent: (
    playerId: string
  ) => { ok: boolean; reason?: string; note?: string };
  setAutomation: (
    patch: Partial<import("@/gm/types").GmAutomation>
  ) => void;
  signFreeAgent: (
    playerId: string,
    salaryM: number,
    years: number
  ) => { ok: boolean; reason?: string; via?: string; note?: string };
  renounceRights: (playerId: string) => void;
  waivePlayer: (playerId: string) => void;
  upgradeStaff: (kind: "scout" | "trainer") => void;
  hireCoach: (coachId: string, seat: "head" | "associate") => void;
  setTrainer: (level: number) => void;
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

function afterDraftProgress(league: GmLeagueState): GmLeagueState {
  let next = league;
  if (
    automationOf(next).autoDraft &&
    next.phase === "draft" &&
    next.draftPool.length > 0
  ) {
    next = finishDraftWithAi(next);
  }
  if (next.phase === "draft" && next.draftPool.length === 0) {
    next = enterFreeAgency(next);
    if (automationOf(next).autoFreeAgency) {
      next = runCpuFreeAgency(next, { includeUser: false });
    }
  }
  return next;
}

function myLeagueAllowsSim(league: GmLeagueState): boolean {
  const ml = useMyLeagueStore.getState();
  if (!ml.simulation) return true;
  ml.syncFromLeague(league);
  return ml.canSimulate().ok;
}

let simTimer: ReturnType<typeof setInterval> | null = null;

function clearSimTimer() {
  if (simTimer != null) {
    clearInterval(simTimer);
    simTimer = null;
  }
}

export const useGmStore = create<GmStore>()(
  persist(
    (set, get) => ({
      league: null,
      simRun: null,
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
              realDataProviderId: "espn+darko+raptor",
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

      setCoaching: (patch) => {
        const league = get().league;
        if (!league) return;
        const teams = league.teams.map((team) => {
          if (team.id !== league.userTeamId) return team;
          const current = coachingOf(team);
          return {
            ...team,
            coaching: {
              ...current,
              ...patch,
              playThrough: patch.playThrough ?? current.playThrough,
            },
          };
        });
        set({ league: withUpdate({ ...league, teams }) });
      },

      setRotationMinutes: (playerId, minutes) => {
        const league = get().league;
        if (!league) return;
        const team = league.teams.find((entry) => entry.id === league.userTeamId);
        if (!team) return;
        const base = team.coaching?.minutes ?? suggestedMinutes(team, league.players);
        const minutesPlan = {
          ...base,
          [playerId]: clamp(Math.round(minutes), 0, 40),
        };
        get().setCoaching({ minutes: minutesPlan });
      },

      resetRotation: () => {
        const league = get().league;
        if (!league) return;
        const teams = league.teams.map((team) => {
          if (team.id !== league.userTeamId) return team;
          const lined = autoSetLineup(team, league.players);
          return {
            ...lined,
            coaching: {
              ...coachingOf(team),
              minutes: suggestedMinutes(lined, league.players),
            },
          };
        });
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

        // Play all games up to this game's day for other teams first.
        // The Cup bracket is written in once group play ends, so those games
        // get played instead of the calendar jumping to Dec. 12.
        let state = ensureNbaCup({ ...league });
        let standings = { ...state.standings };
        let players = [...state.players];
        let schedule = [...state.schedule];
        let boxScores = [...state.boxScores];
        let news = [...state.news];
        let userBoxId: string | null = null;
        const userTeam = state.teams.find((team) => team.id === league.userTeamId);
        const plannedShifts = userTeam ? shiftSnapshot(userTeam, players) : undefined;
        const targetId = next.id;
        let guard = 0;

        while (guard < 1400) {
          guard += 1;
          state = ensureAllStar(
            ensureNbaCup({
              ...state,
              schedule,
              standings,
              players,
              boxScores,
              news,
            })
          );
          schedule = state.schedule;
          news = state.news;
          const target = schedule.find((game) => game.id === targetId);
          if (!target) break;
          const g = schedule
            .filter((game) => !game.played && game.day <= target.day)
            .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id))[0];
          if (!g) break;
          const result = simulateGame(g, state.teams, players, undefined, schedule);
          schedule = schedule.map((x) => (x.id === g.id ? result.game : x));
          if (gameCounts(g)) {
            players = recordSimGame(players, result.box, boxScores);
            standings = applyGameToStandings(
              standings,
              state.teams,
              g.homeTeamId,
              g.awayTeamId,
              result.game.homeScore!,
              result.game.awayScore!
            );
          }
          boxScores = [result.box, ...boxScores].slice(0, 400);
          const cupNote = cupChampionNews(state, result.game);
          const starNote = allStarChampionNews(state, result.game);
          if (cupNote || starNote) news = [starNote, cupNote, ...news].filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(0, 50);
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
          if (g.id === next.id) {
            if (plannedShifts) result.box.shiftPlan = plannedShifts;
            userBoxId = result.box.id;
          }
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

        const playedTarget = schedule.find((game) => game.id === targetId);
        state = noteTradeDeadline(
          withUpdate({
            ...state,
            day: playedTarget?.day ?? state.day,
            schedule,
            standings,
            players,
            boxScores,
            news,
          })
        );
        set({ league: state });
        syncMyLeague(state);
        if (regularSeasonComplete(schedule)) get().advanceToPlayoffs();
        return userBoxId;
      },

      simulateDay: () => {
        const league = get().league;
        if (!league || league.phase !== "regular") return;
        if (!myLeagueAllowsSim(league)) return;
        const stepped = stepDay(league);
        const offered = considerIncomingOffer(stepped.league);
        set({ league: withUpdate(offered) });
        syncMyLeague(offered);
        if (stepped.seasonOver) get().advanceToPlayoffs();
      },

      skipAhead: (kind) => {
        const start = get().league;
        if (!start || start.phase !== "regular") return;
        if (!myLeagueAllowsSim(start)) return;
        const played = (schedule: GmLeagueState["schedule"]) =>
          schedule.filter(
            (g) =>
              g.played &&
              (g.homeTeamId === start.userTeamId ||
                g.awayTeamId === start.userTeamId)
          ).length;
        const startPlayed = played(start.schedule);
        const winsBefore = start.standings[start.userTeamId]?.wins ?? 0;
        const lossesBefore = start.standings[start.userTeamId]?.losses ?? 0;
        const notable: GmLeagueState["boxScores"] = [];
        let state = start;
        let seasonOver = false;
        let guard = 0;
        while (guard < 420 && state.phase === "regular") {
          const target = played(state.schedule);
          if (kind === "week" && target >= startPlayed + 4) break;
          if (kind === "deadline") {
            const mark = tradeDeadlineDate(state.schedule);
            const cursor = state.schedule.find((game) => game.day === state.day)?.gameDate;
            if (mark && cursor && cursor >= mark) break;
          }
          const beforeBoxes = state.boxScores;
          const stepped = stepDay(state);
          if (stepped.league === state && stepped.seasonOver) {
            seasonOver = true;
            break;
          }
          const seen = new Set(beforeBoxes.map((box) => box.id));
          for (const box of stepped.league.boxScores) {
            if (seen.has(box.id)) continue;
            const yours =
              box.homeTeamId === start.userTeamId ||
              box.awayTeamId === start.userTeamId;
            const big = box.players.some((p) => p.points >= 40);
            if (yours || big) notable.push(box);
          }
          state = considerIncomingOffer(stepped.league);
          seasonOver = stepped.seasonOver;
          guard += 1;
          if (state.incomingOffer) break;
          if (seasonOver) break;
        }
        const digest = buildDigest({
          boxes: notable,
          userTeamId: start.userTeamId,
          players: state.players,
          winsBefore,
          lossesBefore,
          winsAfter: state.standings[start.userTeamId]?.wins ?? winsBefore,
          lossesAfter: state.standings[start.userTeamId]?.losses ?? lossesBefore,
          injuries: newInjuries(start.players, state.players, start.userTeamId),
          standings: state.standings,
          teams: state.teams,
        });
        const next = withUpdate({ ...state, digest });
        set({ league: next });
        syncMyLeague(next);
        if (seasonOver) get().advanceToPlayoffs();
      },

      startAutoSim: (kind) => {
        clearSimTimer();
        const start = get().league;
        if (!start || start.phase !== "regular") return;
        if (!myLeagueAllowsSim(start)) return;
        const startPlayed = userGamesPlayed(start);
        const deadlineDay = tradeDeadlineDay(start.schedule);
        set({
          simRun: {
            kind,
            startPlayed,
            deadlineDay,
            winsBefore: start.standings[start.userTeamId]?.wins ?? 0,
            lossesBefore: start.standings[start.userTeamId]?.losses ?? 0,
            notable: [],
          },
        });
        if (kind === "day") {
          get().simulateDay();
          get().stopAutoSim();
          return;
        }
        simTimer = setInterval(() => {
          const run = get().simRun;
          const league = get().league;
          if (!run || !league || league.phase !== "regular" || league.incomingOffer) {
            get().stopAutoSim();
            return;
          }
          const played = userGamesPlayed(league);
          if (run.kind === "next" && played >= run.startPlayed + 1) {
            get().stopAutoSim();
            return;
          }
          if (run.kind === "week" && played >= run.startPlayed + 4) {
            get().stopAutoSim();
            return;
          }
          if (run.kind === "deadline" && league.day >= run.deadlineDay) {
            get().stopAutoSim();
            return;
          }
          const seen = new Set(league.boxScores.map((box) => box.id));
          get().simulateDay();
          const next = get().league;
          const still = get().simRun;
          if (!next || !still) return;
          const notable = [...still.notable];
          for (const box of next.boxScores) {
            if (seen.has(box.id)) continue;
            const yours =
              box.homeTeamId === next.userTeamId || box.awayTeamId === next.userTeamId;
            const big = box.players.some((player) => player.points >= 40);
            if (yours || big) notable.push(box);
          }
          set({ simRun: { ...still, notable } });
          if (next.phase !== "regular" || next.incomingOffer) get().stopAutoSim();
        }, 480);
      },

      stopAutoSim: () => {
        clearSimTimer();
        const run = get().simRun;
        const league = get().league;
        set({ simRun: null });
        if (!league || !run || run.kind === "day" || run.notable.length === 0) return;
        const digest = buildDigest({
          boxes: run.notable,
          userTeamId: league.userTeamId,
          players: league.players,
          winsBefore: run.winsBefore,
          lossesBefore: run.lossesBefore,
          winsAfter: league.standings[league.userTeamId]?.wins ?? run.winsBefore,
          lossesAfter: league.standings[league.userTeamId]?.losses ?? run.lossesBefore,
          injuries: [],
          standings: league.standings,
          teams: league.teams,
        });
        const next = withUpdate({ ...league, digest });
        set({ league: next });
        syncMyLeague(next);
      },

      simulateToDate: (targetDay) => {
        const league = get().league;
        if (!league) return;
        let guard = 0;
        while ((get().league?.day ?? 0) < targetDay && guard < 400) {
          get().simulateDay();
          guard += 1;
          if (get().league?.phase !== "regular" || get().league?.incomingOffer) break;
        }
      },

      simulateToPlayoffs: () => {
        if (!get().league || get().league?.phase !== "regular") return;
        let guard = 0;
        while (get().league?.phase === "regular" && guard < 500) {
          get().simulateDay();
          guard += 1;
          if (get().league?.incomingOffer) break;
        }
      },

      acceptIncomingOffer: (fromAssets, toAssets) => {
        const league = get().league;
        const offer = league?.incomingOffer;
        if (!league || !offer) return { ok: false, reason: "No offer is waiting." };
        if (league.tradeDeadlinePassed) {
          return { ok: false, reason: "The trade deadline has passed." };
        }
        const fair = offerIsFair(league, offer.fromTeamId, offer.toTeamId, fromAssets, toAssets);
        if (!fair.ok) return { ok: false, reason: fair.reason };
        const next = applyTrade(
          { ...league, incomingOffer: undefined },
          {
            fromTeamId: offer.fromTeamId,
            toTeamId: offer.toTeamId,
            fromAssets,
            toAssets,
          }
        );
        set({ league: next });
        syncMyLeague(next);
        return { ok: true };
      },

      declineIncomingOffer: () => {
        const league = get().league;
        const offer = league?.incomingOffer;
        if (!league || !offer) return;
        const caller = league.teams.find((team) => team.id === offer.fromTeamId);
        const next = withUpdate({
          ...league,
          incomingOffer: undefined,
          news: [
            {
              id: uid("news"),
              day: league.day,
              season: league.season,
              headline: `You passed on ${caller?.city ?? "the"} offer`,
              body: "They will call again later in the season.",
              tone: "info" as const,
            },
            ...league.news,
          ].slice(0, 50),
        });
        set({ league: next });
        syncMyLeague(next);
      },

      proposeTrade: (toTeamId, fromAssets, toAssets) => {
        const league = get().league;
        if (!league) return { ok: false, reason: "No league" };
        if (league.tradeDeadlinePassed) {
          return { ok: false, reason: "The trade deadline has passed." };
        }
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

      setTradeStatus: (playerId, status) => {
        const league = get().league;
        if (!league) return;
        const teams = league.teams.map((team) => {
          if (team.id !== league.userTeamId) return team;
          const block = (team.tradeBlock ?? []).filter((id) => id !== playerId);
          const locked = (team.untouchables ?? []).filter((id) => id !== playerId);
          return {
            ...team,
            tradeBlock: status === "block" ? [...block, playerId] : block,
            untouchables:
              status === "untouchable" ? [...locked, playerId] : locked,
          };
        });
        set({ league: withUpdate({ ...league, teams }) });
      },

      setPickProtection: (pickId, topN) => {
        const league = get().league;
        if (!league) return;
        const teams = league.teams.map((team) => ({
          ...team,
          draftPicks: team.draftPicks.map((pick) =>
            pick.id === pickId && pick.ownerTeamId === league.userTeamId
              ? {
                  ...pick,
                  protectionTopN: topN && topN > 0 ? topN : undefined,
                  protected: !!topN && topN > 0,
                }
              : pick
          ),
        }));
        set({ league: withUpdate({ ...league, teams }) });
      },

      draftPlayer: (playerId) => {
        const league = get().league;
        if (!league || league.phase !== "draft") return;
        const sealed = ensureDraftOrder(league);
        const onClock = pickOwnerAt(sealed);
        if (onClock && onClock !== sealed.userTeamId) return;
        let next = runDraftPick(sealed, sealed.userTeamId, playerId);
        next = advanceDraftPastAi(next);
        next = afterDraftProgress(next);
        set({ league: withUpdate(next) });
      },

      simDraftPick: () => {
        const league = get().league;
        if (!league || league.phase !== "draft") return;
        let next = advanceOneDraftPick(league);
        next = afterDraftProgress(next);
        set({ league: withUpdate(next) });
      },

      simDraftToUser: () => {
        const league = get().league;
        if (!league || league.phase !== "draft") return;
        let next = advanceDraftPastAi(league);
        next = afterDraftProgress(next);
        set({ league: withUpdate(next) });
      },

      acceptDraftNightTrade: (offer) => {
        const league = get().league;
        if (!league || league.phase !== "draft") return;
        const live = draftNightOffers(league).some((row) => row.id === offer.id);
        if (!live) return;
        set({ league: withUpdate(applyDraftNightTrade(league, offer)) });
      },

      moveDraftBoard: (playerId, dir) => {
        const league = get().league;
        if (!league) return;
        const order = orderedBoard(league, league.players).map((player) => player.id);
        set({
          league: withUpdate({
            ...league,
            userDraftBoard: moveBoard(order, playerId, dir),
          }),
        });
      },

      resetDraftBoard: () => {
        const league = get().league;
        if (!league) return;
        set({ league: withUpdate({ ...league, userDraftBoard: undefined }) });
      },

      runCombine: () => {
        const league = get().league;
        if (!league || league.combineDone) return;
        const pool = new Set(league.draftPool);
        const players = league.players.map((player) =>
          pool.has(player.id) ? applyCombine(player) : player
        );
        set({
          league: withUpdate({
            ...league,
            players,
            combineDone: true,
            news: [
              {
                id: uid("news"),
                day: league.day,
                season: league.season,
                headline: "Combine results are in",
                body: "Height, wingspan, vertical, sprint, and the medical file are locked for this class.",
                tone: "info" as const,
              },
              ...league.news,
            ].slice(0, 50),
          }),
        });
      },

      simPlayInNight: () => {
        const league = get().league;
        if (!league?.playIn || league.phase !== "play_in") return;
        if (!myLeagueAllowsSim(league)) return;
        let board = league.playIn;
        const games = playInOpenGames(board);
        if (games.length === 0) return;
        const schedule = [...league.schedule];
        let boxScores = [...league.boxScores];
        let players = [...league.players];
        const notes: string[] = [];
        for (const game of games) {
          const tip = {
            id: uid("pi"),
            season: league.season,
            day: league.day,
            homeTeamId: game.homeId,
            awayTeamId: game.awayId,
            played: false,
          };
          const result = simulateGame(tip, league.teams, players);
          result.game.postseason = "play_in";
          result.box.postseason = "play_in";
          schedule.push(result.game);
          boxScores = [result.box, ...boxScores].slice(0, 400);
          const homeWon = (result.game.homeScore ?? 0) > (result.game.awayScore ?? 0);
          board = applyPlayInResult(board, game, homeWon);
          if (result.game.homeScore != null && result.game.awayScore != null) {
            const nineId = board.conferences.find((row) => row.conf === game.conf)?.nineId;
            const slot =
              game.slot === "last" ? "eight" : game.homeId === nineId || game.awayId === nineId ? "nine" : "seven";
            board = {
              ...board,
              conferences: board.conferences.map((conf) =>
                conf.conf === game.conf
                  ? {
                      ...conf,
                      results: [
                        ...(conf.results ?? []),
                        {
                          slot,
                          homeId: game.homeId,
                          awayId: game.awayId,
                          homeScore: result.game.homeScore!,
                          awayScore: result.game.awayScore!,
                        },
                      ],
                    }
                  : conf
              ),
            };
          }
          const winner = homeWon ? game.homeId : game.awayId;
          notes.push(
            `${teamName(league.teams, winner)} beat ${teamName(
              league.teams,
              homeWon ? game.awayId : game.homeId
            )} ${Math.max(result.game.homeScore ?? 0, result.game.awayScore ?? 0)}-${Math.min(
              result.game.homeScore ?? 0,
              result.game.awayScore ?? 0
            )}`
          );
        }
        const done = playInDone(board);
        const next = withUpdate({
          ...league,
          day: league.day + 1,
          playIn: board,
          schedule,
          boxScores,
          players,
          news: [
            {
              id: uid("news"),
              day: league.day,
              season: league.season,
              headline: done ? "Play-in is over" : "Play-in night",
              body: notes.join(". ") + ".",
              tone: "info" as const,
            },
            ...league.news,
          ].slice(0, 50),
        });
        set({ league: next });
        syncMyLeague(next);
        if (done) get().advanceToPlayoffs();
      },

      finishPlayIn: () => {
        let guard = 0;
        while (get().league?.phase === "play_in" && guard < 6) {
          get().simPlayInNight();
          guard += 1;
        }
      },

      advanceToPlayoffs: () => {
        const current = get().league;
        if (
          !current ||
          current.phase === "playoffs" ||
          current.phase === "draft" ||
          current.phase === "offseason" ||
          current.phase === "free_agency"
        )
          return;
        const league = current.phase === "regular" ? stampSeasonAwards(current) : current;
        if (league.phase !== "play_in") {
          const board = createPlayInBoard(league);
          if (board) {
            const userConf = league.teams.find((t) => t.id === league.userTeamId);
            const spot = board.conferences.find((c) => c.conf === userConf?.conference);
            const inIt =
              spot &&
              [spot.sevenId, spot.eightId, spot.nineId, spot.tenId].includes(
                league.userTeamId
              );
            const next = withUpdate({
              ...league,
              phase: "play_in",
              playIn: board,
              news: [
                {
                  id: uid("news"),
                  day: league.day,
                  season: league.season,
                  headline: "Play-in starts",
                  body: inIt
                    ? "You are in the play-in. Win the 7-8 game and you are the 7 seed. The 9-10 winner still has one game for the 8 seed."
                    : "Seeds 1 through 6 are in. The 7 through 10 seeds play for the last two spots.",
                  tone: "info" as const,
                },
                ...league.news,
              ].slice(0, 50),
            });
            set({ league: next });
            syncMyLeague(next);
            return;
          }
        }
        if (league.phase === "play_in" && league.playIn && !playInDone(league.playIn)) {
          return;
        }
        const seeds = league.playIn ? playoffSeeds(league, league.playIn) : undefined;
        const playoffIds = seeds ? playoffTeamIdSet(seeds) : undefined;
        const bracket = buildPlayoffBracket(league, seeds);
        const lotteryOrder = computeLotteryOrder(league, playoffIds);
        const next = withUpdate({
          ...league,
          phase: "playoffs",
          playIn: undefined,
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
        const bracket = league.playoffBracket.map((s) => ({ ...s }));
        const schedule = [...league.schedule];
        let boxScores = [...league.boxScores];
        let players = league.players;

        const openRound = Math.min(...bracket.filter((series) => !series.done).map((series) => series.round));
        const open = bracket.filter((series) => !series.done && series.round === openRound);
        const tonight = open.filter(
          (_, index) => open.length <= 2 || index % 2 === league.day % 2
        );
        for (const series of tonight) {
          const court = seriesHosts(series);
          const game = {
            id: uid("pg"),
            season: league.season,
            day: league.day,
            homeTeamId: court.homeTeamId,
            awayTeamId: court.awayTeamId,
            played: false,
            postseason: "playoffs" as const,
          };
          const result = simulateGame(game, league.teams, players);
          result.box.postseason = "playoffs";
          schedule.push(result.game);
          boxScores = [result.box, ...boxScores].slice(0, 400);
          players = rollGameInjuries(
            { ...league, players },
            result.box.players.map((line) => line.playerId),
            league.day * 17 + series.id.length
          );
          if (result.game.homeScore != null && result.game.awayScore != null) {
            series.games = [
              ...(series.games ?? []),
              {
                homeTeamId: result.game.homeTeamId,
                awayTeamId: result.game.awayTeamId,
                homeScore: result.game.homeScore,
                awayScore: result.game.awayScore,
              },
            ];
          }
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
        }
        players = tickInjuries(
          players,
          league.teams.find((team) => team.id === league.userTeamId)?.staff.trainerLevel ?? 1
        );

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
                  const home = betterRecord(league, confW[i]!, confW[i + 1]!);
                  const away = home === confW[i] ? confW[i + 1]! : confW[i]!;
                  bracket.push({
                    id: uid("series"),
                    round: 2,
                    conf,
                    teamAId: home,
                    teamBId: away,
                    seedA: 1,
                    seedB: 2,
                    winsA: 0,
                    winsB: 0,
                    done: false,
                    games: [],
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
                const home = betterRecord(league, confW[0], confW[1]);
                const away = home === confW[0] ? confW[1] : confW[0];
                bracket.push({
                  id: uid("series"),
                  round: 3,
                  conf,
                  teamAId: home,
                  teamBId: away,
                  seedA: 1,
                  seedB: 2,
                  winsA: 0,
                  winsB: 0,
                  done: false,
                  games: [],
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
              const home = betterRecord(league, east.winnerId, west.winnerId);
              const away = home === east.winnerId ? west.winnerId : east.winnerId;
              bracket.push({
                id: uid("series"),
                round: 4,
                conf: "Finals",
                teamAId: home,
                teamBId: away,
                seedA: 1,
                seedB: 2,
                winsA: 0,
                winsB: 0,
                done: false,
                games: [],
              });
            }
          } else if (currentRound === 4) {
            const lotteryOrder = league.lotteryOrder ?? computeLotteryOrder(league);
            let drafted = withUpdate({
              ...league,
              phase: "draft" as const,
              playoffBracket: bracket,
              schedule,
              boxScores,
              players,
              draftPickIndex: 0,
              lotteryOrder,
              draftOrder: expandDraftOrder(lotteryOrder),
              news: [
                {
                  id: uid("news"),
                  day: league.day,
                  season: league.season,
                  headline: "Champions crowned, draft is next",
                  body: "The Finals are over. Lottery order is locked. Watch the board, trade up, or take your swing.",
                  tone: "good" as const,
                },
                ...league.news,
              ].slice(0, 50),
            });
            if (automationOf(drafted).autoDraft) {
              drafted = advanceDraftPastAi(drafted);
              drafted = afterDraftProgress(drafted);
            }
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

      finishPlayoffRound: () => {
        const start = get().league;
        if (!start?.playoffBracket || start.phase !== "playoffs") return;
        const round = Math.max(
          ...start.playoffBracket.filter((s) => !s.done).map((s) => s.round),
          0
        );
        let guard = 0;
        while (guard < 30) {
          const league = get().league;
          if (!league || league.phase !== "playoffs") break;
          const open = (league.playoffBracket ?? []).some(
            (s) => s.round === round && !s.done
          );
          if (!open) break;
          get().simPlayoffDay();
          guard += 1;
        }
        const end = get().league;
        if (!end) return;
        const seen = new Set(start.boxScores.map((box) => box.id));
        const digest = buildDigest({
          boxes: end.boxScores.filter((box) => !seen.has(box.id)),
          userTeamId: start.userTeamId,
          players: end.players,
          winsBefore: start.standings[start.userTeamId]?.wins ?? 0,
          lossesBefore: start.standings[start.userTeamId]?.losses ?? 0,
          winsAfter: end.standings[start.userTeamId]?.wins ?? 0,
          lossesAfter: end.standings[start.userTeamId]?.losses ?? 0,
          injuries: newInjuries(start.players, end.players, start.userTeamId),
          standings: end.standings,
          teams: end.teams,
        });
        set({ league: withUpdate({ ...end, digest }) });
      },

      simRestOfPlayoffs: () => {
        const start = get().league;
        if (!start || start.phase !== "playoffs") return;
        let guard = 0;
        while (guard < 80 && get().league?.phase === "playoffs") {
          get().simPlayoffDay();
          guard += 1;
        }
        const end = get().league;
        if (!end) return;
        const seen = new Set(start.boxScores.map((box) => box.id));
        const digest = buildDigest({
          boxes: end.boxScores.filter((box) => !seen.has(box.id)).slice(0, 80),
          userTeamId: start.userTeamId,
          players: end.players,
          winsBefore: 0,
          lossesBefore: 0,
          winsAfter: 0,
          lossesAfter: 0,
          injuries: newInjuries(start.players, end.players, start.userTeamId),
          standings: end.standings,
          teams: end.teams,
        });
        set({ league: withUpdate({ ...end, digest }) });
      },

      runOffseason: () => {
        const league = get().league;
        if (!league) return;
        if (league.phase === "free_agency") {
          const next = withUpdate(startNextSeason(league));
          set({ league: next });
          useMyLeagueStore.getState().bootstrap(next);
          return;
        }
        get().openFreeAgency();
      },

      openFreeAgency: () => {
        const league = get().league;
        if (!league || league.phase === "free_agency") return;
        const drafted =
          league.draftPool.length > 0 ? finishDraftWithAi(league) : league;
        let next = enterFreeAgency(drafted);
        if (automationOf(next).autoFreeAgency) {
          next = runCpuFreeAgency(next, { includeUser: false });
        }
        next = withUpdate(next);
        set({ league: next });
        syncMyLeague(next);
      },

      runCpuSignings: () => {
        const league = get().league;
        if (!league) return;
        const next = withUpdate(runCpuFreeAgency(league, { includeUser: false }));
        set({ league: next });
        syncMyLeague(next);
      },

      advanceFaDay: () => {
        const league = get().league;
        if (!league || league.phase !== "free_agency") return;
        if (league.faMarket?.done) return;
        const next = withUpdate(advanceFaDayEngine(league));
        set({ league: next });
        syncMyLeague(next);
      },

      resignOwnFreeAgent: (playerId) => {
        const league = get().league;
        if (!league) return { ok: false, reason: "No league" };
        const result = resignOwnFreeAgentEngine(league, playerId);
        if (!result.ok) return result;
        const next = withUpdate(result.state);
        set({ league: next });
        syncMyLeague(next);
        return { ok: true, note: result.note };
      },

      setAutomation: (patch) => {
        const league = get().league;
        if (!league) return;
        set({
          league: withUpdate({
            ...league,
            automation: { ...automationOf(league), ...patch },
          }),
        });
      },

      signFreeAgent: (playerId, salaryM, years) => {
        const league = get().league;
        if (!league) return { ok: false, reason: "No league" };
        const result = userOfferFreeAgent(league, playerId, salaryM, years);
        if (result.state) {
          const next = withUpdate(result.state);
          set({ league: next });
          syncMyLeague(next);
          if (!result.ok) return { ok: false, reason: result.reason };
          const via = next.players.find((p) => p.id === playerId)?.contract?.signedVia;
          return { ok: true, via, note: result.note };
        }
        if (!result.ok) return result;
        return { ok: false, reason: "Offer failed." };
      },

      renounceRights: (playerId) => {
        const league = get().league;
        if (!league) return;
        const players = league.players.map((p) =>
          p.id === playerId && p.rightsTeamId === league.userTeamId
            ? {
                ...p,
                rightsTeamId: null,
                rightsKind: undefined,
                lastSalaryM: undefined,
              }
            : p
        );
        set({ league: withUpdate({ ...league, players }) });
      },

      waivePlayer: (playerId) => {
        const league = get().league;
        if (!league) return;
        const target = league.players.find((p) => p.id === playerId);
        const players = league.players.map((p) => {
          if (p.id !== playerId) return p;
          const rights =
            p.contract?.birdRights === "bird" || p.contract?.birdRights === "early"
              ? p.contract.birdRights
              : null;
          return {
            ...p,
            teamId: null,
            rightsTeamId: rights ? league.userTeamId : null,
            rightsKind: rights ?? undefined,
            lastSalaryM: rights ? p.contract?.annualSalaryM : undefined,
            contract: null,
          };
        });
        const teams = league.teams.map((t) => {
          if (t.id !== league.userTeamId) return t;
          const starters = { ...t.starters };
          for (const pos of Object.keys(starters) as GmPosition[]) {
            if (starters[pos] === playerId) starters[pos] = null;
          }
          const dead =
            target?.contract != null
              ? [
                  ...(t.deadMoney ?? []),
                  {
                    id: uid("dead"),
                    playerId,
                    label: target.name,
                    annualM: target.contract.annualSalaryM,
                    yearsLeft: Math.max(1, target.contract.yearsRemaining),
                  },
                ]
              : t.deadMoney;
          return {
            ...t,
            starters,
            benchOrder: t.benchOrder.filter((id) => id !== playerId),
            deadMoney: dead,
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

      hireCoach: (coachId, seat) => {
        const league = get().league;
        if (!league) return;
        const team = league.teams.find((entry) => entry.id === league.userTeamId);
        if (!team) return;
        const market = league.coachMarket ?? openCoachMarket();
        const hired = market.find((coach) => coach.id === coachId);
        if (!hired) return;
        const overTax = capStatus(team, league.players, league.settings, league.season).overTax;
        const next = seat === "associate" ? asAssociate(hired) : hired;
        const quote = hireQuote(team, overTax, { salaryM: next.salaryM ?? 0 }, seat === "associate" ? "associate" : "head");
        if (!quote.ok) return;
        const fired = seat === "head" ? team.staff.headCoach : null;
        const teams = league.teams.map((entry) => {
          if (entry.id !== team.id) return entry;
          return seat === "associate" ? withAssociate(entry, next) : withHeadCoach(entry, next);
        });
        const coachMarket = market.filter((coach) => coach.id !== hired.id);
        if (fired?.name && fired.name !== "Head Coach") {
          coachMarket.push({ ...fired, id: fired.id ?? fired.name });
        }
        set({
          league: withUpdate({
            ...league,
            teams,
            coachMarket,
            news: [
              {
                id: uid("news"),
                day: league.day,
                season: league.season,
                headline:
                  seat === "associate"
                    ? `${hired.name} joins the bench`
                    : `${hired.name} is the head coach`,
                body:
                  seat === "associate"
                    ? `${next.salaryM?.toFixed(1)}M a year as associate. ${hired.trait ?? ""}`
                    : `${hired.trait ?? ""} ${hired.tradeoff ?? ""}`.trim(),
                tone: "info" as const,
              },
              ...league.news,
            ].slice(0, 50),
          }),
        });
      },

      setTrainer: (level) => {
        const league = get().league;
        if (!league) return;
        const tier = TRAINER_TIERS.find((row) => row.level === level);
        const team = league.teams.find((entry) => entry.id === league.userTeamId);
        if (!tier || !team) return;
        const overTax = capStatus(team, league.players, league.settings, league.season).overTax;
        const quote = hireQuote(team, overTax, tier, "trainer");
        if (!quote.ok) return;
        const teams = league.teams.map((entry) => {
          if (entry.id !== team.id) return entry;
          return {
            ...entry,
            staff: { ...entry.staff, trainer: { ...tier }, trainerLevel: tier.level },
          };
        });
        set({ league: withUpdate({ ...league, teams }) });
      },

      upgradeStaff: (kind) => {
        const league = get().league;
        if (!league) return;
        if (kind === "scout") {
          // Legacy button - bump eye on hired scout instead of opaque level.
          const teams = league.teams.map((t) => {
            if (t.id !== league.userTeamId) return t;
            const raised = t.staff.scout
              ? {
                  ...t.staff.scout,
                  eye: Math.min(5, t.staff.scout.eye + 1),
                  yearsExperience: t.staff.scout.yearsExperience + 1,
                  salaryM: Math.round((t.staff.scout.salaryM + 0.4) * 10) / 10,
                }
              : t.staff.scout;
            if (raised && t.staff.scout) {
              const overTax = capStatus(t, league.players, league.settings, league.season).overTax;
              if (!hireQuote(t, overTax, raised, "scout").ok) return t;
            }
            const scout = raised;
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
        const team = league.teams.find((entry) => entry.id === league.userTeamId);
        const next = TRAINER_TIERS.find((row) => row.level > (team?.staff.trainerLevel ?? 0));
        if (next) get().setTrainer(next.level);
      },

      hireScout: (scoutId) => {
        const league = get().league;
        if (!league) return;
        const market = league.scoutMarket ?? [];
        const hired = market.find((s) => s.id === scoutId);
        if (!hired) return;
        const team = league.teams.find((entry) => entry.id === league.userTeamId);
        if (!team) return;
        const overTax = capStatus(team, league.players, league.settings, league.season).overTax;
        if (!hireQuote(team, overTax, hired, "scout").ok) return;
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
          const league = adoptRealSchedule(ensureProspectIdentities(state.league));
          const players = league.players.map((player) => ensurePlayerSheet(applyRookieRatings(player)));
          const lined =
            league.lineupRoles === 1
              ? league.teams
              : league.teams.map((team) =>
                  team.coaching?.minutes ? team : autoSetLineup(team, players)
                );
          const teams = league.staffBook === 1 ? lined : lined.map((team) => installStaff(team));
          const seated = applyRealBooks(ensureNbaCup(claimOpeningRosters({ ...league, players, teams })));
          state.league = {
            ...seated,
            lineupRoles: 1,
            staffBook: 1,
            rosterBook: 1,
            coachMarket: league.coachMarket?.length ? league.coachMarket : openCoachMarket(),
          };
        }
        state?.setHydrated(true);
      },
    }
  )
);
