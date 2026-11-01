"use client";

import { assignMentor } from "@/gm/engine/development";

import { DRAFT_ROLES, draftScoutingOf, studyProspect, toggleDraftWatch } from "@/gm/engine/draft-intel";
import { executeDraftTrade, type DraftTradeProposal } from "@/gm/engine/draft-trades";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  GmLeagueState,
  GmLeagueSettings,
  GmPlayer,
  GmDraftRole,
  GmDraftTool,
  GmScoutStudy,
  GmPosition,
  GmRotationDepth,
  GmTradeAsset,
} from "@/gm/types";
import { createGeneratedLeague } from "@/gm/seed/create-league";
import { simulateGame, compactSimBox } from "@/gm/engine/simulate";
import { ensurePlayerSheet } from "@/gm/engine/attributes";
import { applyRookieRatings } from "@/gm/engine/rookie-ratings";
import { applyRealBooks } from "@/gm/seed/real-books";
import {
  applyDraftNightTrade,
  draftNightOffers,
  ensureDraftOrder,
  moveBoard,
  orderedBoard,
  pickOwnerAt,
  type DraftNightOffer,
} from "@/gm/engine/draft-room";
import { userGamesPlayed } from "@/gm/lib/selectors";
import { buildDigest, newInjuries, stepDay } from "@/gm/engine/pace";
import { ensureNbaCup } from "@/gm/engine/cup";
import { stampSeasonAwards } from "@/gm/engine/awards";
import { buildChampionResult } from "@/gm/engine/finals-mvp";
import {
  adoptRealSchedule,
  regularSeasonComplete,
  tradeDeadlineDate,
  tradeDeadlineDay,
} from "@/gm/engine/schedule";
import { applyTrade, evaluateTrade, suggestCounterOffer } from "@/gm/engine/trades";
import {
  considerIncomingOffer,
  offerIsFair,
  recordDeclinedOffer,
} from "@/gm/engine/offers";
import {
  considerTeamBuildingCheckpoint,
  continuePastCheckpoint as continuePastCheckpointEngine,
  isCalendarPaused,
  isTeamBuildingPaused,
  pauseForTeamBuilding as pauseForTeamBuildingEngine,
  restoreSnoozedCheckpoint,
} from "@/gm/engine/checkpoints";
import {
  applyScoutingFocus as applyScoutingFocusEngine,
  autoScoutingFocus as autoScoutingFocusEngine,
  considerScoutingFocus,
  skipScoutingFocus as skipScoutingFocusEngine,
} from "@/gm/engine/scouting-focus";
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
  runCpuFreeAgency,
} from "@/gm/engine/offseason";
import {
  advanceFaDayDetailed,
  applyOptionDecision,
  declineQualifyingOffer as declineQoEngine,
  resignOwnFreeAgent as resignOwnFreeAgentEngine,
  tenderQualifyingOffer as tenderQoEngine,
  toggleFaWatchlist,
  userOfferFreeAgent,
} from "@/gm/engine/free-agency";
import {
  declineOfferSheet as declineSheetEngine,
  matchOfferSheet as matchSheetEngine,
} from "@/gm/engine/fa-rfa";
import {
  applyCombine,
  ensureProspectIdentities,
  revealScouting,
  staffScoutContext,
} from "@/gm/engine/scouting";
import { generateDeveloperMarket } from "@/gm/seed/developers";
import { generateScoutMarket, ensureScoutKnack } from "@/gm/seed/scouts";
import { devKnackLabel, scoutKnackLabel } from "@/gm/seed/staff-knacks";
import {
  assignLeaguePositions,
  POSITION_BOOK_VERSION,
  autoSetLineup,
  reassignPosition,
  setSecondaryPosition,
  slotAccepts,
} from "@/gm/engine/lineup";
import { capStatus } from "@/gm/engine/cap";
import { cbaSeason } from "@/gm/engine/season-flow-state";
import { advanceSeasonJourney as advanceJourneyEngine, beginOffseason, decideRookieContract as decideRookieEngine, reopenRosterFill } from "@/gm/engine/season-flow";
import { applyTrainingCamp, assignCamp, runSummerLeague, suggestCampAssignments } from "@/gm/engine/season-development";
import { offerExtension } from "@/gm/engine/extensions";
import { releasePlayer } from "@/gm/engine/roster-decisions";
import { asAssociate, hireQuote, withAssociate, withHeadCoach } from "@/gm/engine/staff";
import { installStaff, openCoachMarket, TRAINER_TIERS } from "@/gm/seed/coaches";
import { claimOpeningRosters } from "@/gm/seed/opening-roster";
import {
  autoBalanceRotation as buildBalancedMinutes,
  coachingOf,
  rebalanceForInjuryChanges,
  resetBalancedRotation,
} from "@/gm/engine/coaching";
import type { GmCoaching } from "@/gm/types";
import { prepareFranchise, franchisePlan, parseFranchise, importDraftClass as importDraftClassEngine } from "@/gm/engine/franchise";
import { overallFromAttributes } from "@/gm/engine/attributes";
import { uid, clamp } from "@/gm/engine/rng";
import {
  betterRecord,
  buildPlayoffBracket,
  computeLotteryOrder,
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
import {
  allocateNewSave,
  createGmSlotStorage,
  deleteSaveSlot,
  parkActiveSave,
  readLayerARaw,
  readLayerBRaw,
  readSaveIndex,
  setActiveSaveId,
  type GmSaveMeta,
} from "@/gm/state/gm-saves";
import { startYearFromCanonicalSeason } from "@/data/providers/historical/season-range";

/** Incoming offer → team-building date → monthly scouting focus. */
function afterDayGates(league: GmLeagueState): GmLeagueState {
  const pauses = franchisePlan(league).pauses;
  let next = pauses.offers ? considerIncomingOffer(league) : league;
  if (!next.incomingOffer) next = considerTeamBuildingCheckpoint(next);
  if (!next.incomingOffer && !next.teamBuildingCheckpoint) {
    next = considerScoutingFocus(next);
    if (!pauses.scouting && next.scoutingFocusPrompt) next = autoScoutingFocusEngine(next);
  }
  return next;
}

const idbStorage = createGmSlotStorage("a");

/** Normalize a league blob after load (same pass as persist rehydrate). */
export function normalizeLoadedLeague(league: GmLeagueState): GmLeagueState {
  const next = prepareFranchise(adoptRealSchedule(ensureProspectIdentities(league)));
  const needsPositions = next.positionBook !== POSITION_BOOK_VERSION;
  const sheeted = next.players.map((player) =>
    ensurePlayerSheet(applyRookieRatings(player))
  );
  const players = needsPositions ? assignLeaguePositions(sheeted) : sheeted;
  const lined =
    next.lineupRoles === 1 && !needsPositions
      ? next.teams
      : next.teams.map((team) => {
          const cleared = needsPositions
            ? {
                ...team,
                coaching: team.coaching
                  ? {
                      ...coachingOf(team),
                      minutes: undefined,
                      coverSlot: undefined,
                    }
                  : team.coaching,
              }
            : team;
          if (cleared.coaching?.minutes && next.lineupRoles === 1) {
            return cleared;
          }
          return autoSetLineup(cleared, players);
        });
  const teams = next.staffBook === 1 ? lined : lined.map((team) => installStaff(team));
  const seated = applyRealBooks(
    ensureNbaCup(claimOpeningRosters({ ...next, players, teams }))
  );
  return {
    ...seated,
    automation: {
      ...automationOf(seated),
      autoScout: seated.automation?.autoScout === true,
    },
    lineupRoles: 1,
    staffBook: 1,
    rosterBook: 1,
    positionBook: POSITION_BOOK_VERSION,
    coachMarket: next.coachMarket?.length ? next.coachMarket : openCoachMarket(),
  };
}

type CreationOptions = { replace?: boolean; settings?: Partial<GmLeagueSettings>; commissioner?: boolean };

interface GmStore {
  assignPlayerMentor: (playerId: string, mentorId: string | null) => void;
  runTrainingCamp: () => void;
  lastDevelopmentNote: string | null;
  league: GmLeagueState | null;
  hydrated: boolean;
  seeding: boolean;
  seedError: string | null;
  /** Last FA desk note (offer result, advance block, etc.). */
  lastFaNote: string | null;
  lastDraftNote: string | null;
  scoutProspect: (playerId:string,method:GmScoutStudy,focus?:GmDraftTool)=>void;
  setDraftStrategy: (strategy:GmDraftRole)=>void;
  toggleDraftWatch: (playerId:string)=>void;
  makeDraftTrade: (proposal:DraftTradeProposal)=>{ok:boolean;reason:string};
  setDevelopmentPlan: (playerId:string,plan:NonNullable<GmPlayer["developmentPlan"]>)=>void;
  lastJourneyNote: string | null;
  advanceSeasonJourney: () => void;
  decideRookieContract: (playerId: string, sign: boolean) => void;
  setCampAssignment: (playerId: string, focus: import("@/gm/types").GmCampFocus | null) => void;
  playSummerLeague: (skip?: boolean) => void;
  suggestCampPlan: () => void;
  openRosterFill: () => void;
  extendPlayer: (playerId: string, salaryM: number, years: number) => { ok: boolean; reason: string };
  /** IndexedDB franchise slots (newest first). */
  saves: GmSaveMeta[];
  activeSaveId: string | null;
  importSave: (text: string) => Promise<void>;
  updateFranchise: (patch: Partial<import("@/gm/types").GmFranchisePlan>) => void;
  updateSimulationSettings: (patch: Partial<Pick<import("@/gm/types").GmLeagueSettings, "injuryFrequency" | "developmentSpeed" | "tradeDifficulty" | "simPace">>) => void;
  setDevelopmentFocus: (playerId: string, focus: NonNullable<import("@/gm/types").GmPlayer["developmentFocus"]>) => void;
  promiseMinutes: (playerId: string, minutes: number) => void;
  editAttribute: (playerId: string, attribute: keyof import("@/gm/types").GmAttributes, value: number) => void;
  importDraftClass: (text: string) => void;
  setHydrated: (v: boolean) => void;
  refreshSaves: () => Promise<void>;
  /**
   * Real NBA rosters (async).
   * From the hub, opens a new slot. With an active league (reload banners), replaces that slot.
   */
  newLeague: (
    userTeamId?: string,
    season?: string,
    opts?: CreationOptions
  ) => Promise<void>;
  /** Synthetic fallback (offline / demo). */
  newGeneratedLeague: (userTeamId?: string, opts?: CreationOptions) => void;
  /** Park the active save and return to My Teams (does not delete). */
  leaveToHub: () => Promise<void>;
  /** Resume a parked save. */
  resumeSave: (id: string) => Promise<void>;
  /** Permanently delete a save slot. */
  deleteSave: (id: string) => Promise<void>;
  /** @deprecated Prefer leaveToHub / deleteSave. */
  resetLeague: () => void;
  setStarter: (position: GmPosition, playerId: string | null) => void;
  /** Relist a rostered player. Overall follows the new position weights. */
  setPlayerPosition: (playerId: string, position: GmPosition) => void;
  /** Alternate listing for rotation bars and out-of-position sim fit. */
  setPlayerSecondary: (playerId: string, position: GmPosition | null) => void;
  autoLineup: () => void;
  setCoaching: (patch: Partial<GmCoaching>) => void;
  setRotationMinutes: (playerId: string, minutes: number) => void;
  /** Set how many bodies get minutes, then rebuild the book. */
  setRotationDepth: (depth: GmRotationDepth) => void;
  /** Keep starters; rebuild a balanced 240 chart. */
  autoBalanceRotation: () => void;
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
  simPauseReason: string | null;
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
  /** Stay on a team-building date and manage the roster / trades. */
  pauseForTeamBuilding: () => void;
  /** Clear the team-building pause and keep the calendar moving. */
  continuePastCheckpoint: () => void;
  /** Lock monthly scouting focus on up to three prospects. */
  applyScoutingFocus: (
    playerIds: string[],
    positionFocus?: GmPosition | null
  ) => void;
  /** Let the hired scout assign this month's focuses. */
  autoScoutingFocus: () => void;
  /** Skip this month's scouting focus window. */
  skipScoutingFocus: () => void;
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
  /** Fill the rest of the board with CPU picks; stay on draft for the recap. */
  finishDraftBoard: () => void;
  acceptDraftNightTrade: (offer: DraftNightOffer) => void;
  moveDraftBoard: (playerId: string, dir: "up" | "down" | "top") => void;
  resetDraftBoard: () => void;
  runCombine: () => void;
  /** Fill one fogged grade on a draft prospect (does not reveal identity). */
  scoutLook: (playerId: string) => void;
  advanceToPlayoffs: () => void;
  /** Leave the awards night and open play-in / bracket on home. */
  ackAwardsShow: () => void;
  /** Leave the champion splash and open season review. */
  ackChampionSplash: () => void;
  simPlayoffDay: () => void;
  /** Advance one guided summer step. Kept for existing callers. */
  runOffseason: () => void;
  openFreeAgency: () => void;
  runCpuSignings: () => void;
  /** Advance one day on the free-agency clock. */
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
  decideTeamOption: (
    playerId: string,
    decision: "exercise" | "decline"
  ) => void;
  tenderQualifyingOffer: (playerId: string) => void;
  declineQualifyingOffer: (playerId: string) => void;
  matchOfferSheet: (sheetId: string) => void;
  declineOfferSheet: (sheetId: string) => void;
  toggleFaWatchlist: (playerId: string) => void;
  renounceRights: (playerId: string) => void;
  waivePlayer: (playerId: string) => void;
  upgradeStaff: (kind: "scout" | "trainer") => void;
  hireCoach: (coachId: string, seat: "head" | "associate") => void;
  setTrainer: (level: number) => void;
  /** Hire a director of scouting from the market (replaces current). */
  hireScout: (scoutId: string) => void;
  /** Refresh the available scout market. */
  refreshScoutMarket: () => void;
  /** Hire a player-development director from the market. */
  hireDeveloper: (developerId: string) => void;
  refreshDeveloperMarket: () => void;
}

function withCreationSettings(league: GmLeagueState, opts?: CreationOptions): GmLeagueState {
  const settings = { ...league.settings };
  for (const key of ["injuryFrequency", "developmentSpeed", "tradeDifficulty", "simPace"] as const) {
    const value = opts?.settings?.[key];
    if (typeof value === "number" && Number.isFinite(value)) settings[key] = clamp(value, key === "injuryFrequency" ? 0 : key === "simPace" ? 0.8 : 0.5, key === "simPace" ? 1.2 : 2);
  }
  return { ...league, settings, franchise: { ...franchisePlan(league), commissioner: opts?.commissioner ?? league.franchise?.commissioner ?? false } };
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
  // Leave an empty board on draft so the recap page can show. Only jump
  // straight into free agency when that automation switch is on.
  if (
    next.phase === "draft" &&
    next.draftPool.length === 0 &&
    !next.seasonFlow &&
    automationOf(next).autoFreeAgency
  ) {
    next = enterFreeAgency(next);
    next = runCpuFreeAgency(next, { includeUser: false });
  }
  return next;
}

function myLeagueAllowsSim(league: GmLeagueState): boolean {
  syncMyLeague(league);
  return league.phase === "regular";
}

function calendarPauseReason(league: GmLeagueState): string | null {
  if (league.incomingOffer) return "Paused for a trade offer. Accept or decline it to continue.";
  if (league.teamBuildingCheckpoint) return `Paused: ${league.teamBuildingCheckpoint.title}. Review the decision, then continue.`;
  if (league.scoutingFocusPrompt) return "Paused for monthly scouting. Assign or skip this month's focus to continue.";
  return null;
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
      lastDevelopmentNote: null,
      assignPlayerMentor: (playerId, mentorId) => {
        const league = get().league; if (!league) return;
        const result = assignMentor(league, playerId, mentorId);
        set({ league: withUpdate(result.state), lastDevelopmentNote: result.reason });
      },
      runTrainingCamp: () => {
        const league = get().league; if (!league) return;
        set({ league: withUpdate(applyTrainingCamp(league)), lastJourneyNote: "Training camp results are saved. Continue from the season hub." });
      },
      league: null,
      lastFaNote: null, lastDraftNote: null,
      lastJourneyNote: null,
      advanceSeasonJourney: () => {
        const league = get().league; if (!league) return;
        const result = advanceJourneyEngine(league);
        const next = withUpdate(result.state);
        set({ league: next, lastJourneyNote: result.reason });
        if (next.season !== league.season) useMyLeagueStore.getState().bootstrap(next);
        else syncMyLeague(next);
      },
      decideRookieContract: (playerId, sign) => {
        const league = get().league; if (!league) return;
        const result = decideRookieEngine(league, playerId, sign);
        set({ league: withUpdate(result.state), lastJourneyNote: result.reason });
        syncMyLeague(result.state);
      },
      setCampAssignment: (playerId, focus) => {
        const league = get().league; if (!league) return;
        const result = assignCamp(league, playerId, focus);
        set({ league: withUpdate(result.state), lastJourneyNote: result.reason });
        syncMyLeague(result.state);
      },
      suggestCampPlan: () => {
        const league = get().league; if (!league) return;
        const result = suggestCampAssignments(league);
        set({ league: withUpdate(result.state), lastJourneyNote: result.reason });
        syncMyLeague(result.state);
      },
      playSummerLeague: (skip = false) => {
        const league = get().league; if (!league) return;
        const next = withUpdate(runSummerLeague(league, skip));
        set({ league: next, lastJourneyNote: skip ? "Summer games skipped." : "Summer results are ready. Invitees have not signed NBA contracts." });
        syncMyLeague(next);
      },
      openRosterFill: () => {
        const league = get().league; if (!league) return;
        const result = reopenRosterFill(league);
        set({ league: withUpdate(result.state), lastJourneyNote: result.reason });
        syncMyLeague(result.state);
      },
      extendPlayer: (playerId, salaryM, years) => {
        const league = get().league; if (!league) return { ok: false, reason: "No franchise loaded." };
        const result = offerExtension(league, playerId, salaryM, years);
        set({ league: withUpdate(result.state), lastJourneyNote: result.reason });
        syncMyLeague(result.state);
        return { ok: result.ok, reason: result.reason };
      },
      simRun: null,
      simPauseReason: null,
      hydrated: false,
      seeding: false,
      seedError: null,
      saves: [],
      activeSaveId: null,
      setHydrated: (v) => set({ hydrated: v }),
      importSave: async (text) => {
        const league = parseFranchise(text);
        clearSimTimer();
        await allocateNewSave({ userTeamId: league.userTeamId, season: league.season });
        set({ league, lastFaNote: null, lastDraftNote: null, lastJourneyNote: null, seeding: false, seedError: null, simRun: null });
        useMyLeagueStore.getState().bootstrap(league);
        await get().refreshSaves();
      },
      updateFranchise: (patch) => {
        const league = get().league; if (!league) return;
        const franchise = { ...franchisePlan(league), ...patch };
        const teams = league.teams.map(team => team.id === league.userTeamId ? { ...team, ownerGoal: franchise.intent === "develop" ? "tank" as const : franchise.intent } : team);
        set({ league: withUpdate({ ...league, teams, franchise }) });
      },
      updateSimulationSettings: (patch) => {
        const league = get().league; if (!league) return;
        const settings = { ...league.settings };
        for (const key of ["injuryFrequency", "developmentSpeed", "tradeDifficulty", "simPace"] as const) {
          const v = patch[key]; if (typeof v === "number" && Number.isFinite(v)) settings[key] = clamp(v, key === "injuryFrequency" ? 0 : 0.5, key === "simPace" ? 1.2 : 2);
        }
        set({ league: withUpdate({ ...league, settings }) });
      },
      setDevelopmentFocus: (playerId, focus) => {
        const league = get().league; if (!league) return;
        set({ league: withUpdate({ ...league, players: league.players.map(p => p.id === playerId && p.teamId === league.userTeamId ? { ...p, developmentFocus: focus } : p) }) });
      },
      promiseMinutes: (playerId, minutes) => {
        const league = get().league; if (!league || !Number.isFinite(minutes)) return;
        set({ league: withUpdate({ ...league, players: league.players.map(p => p.id === playerId && p.teamId === league.userTeamId ? { ...p, rolePromise: { teamId: league.userTeamId, minutes: clamp(Math.round(minutes), 0, 40), madeDay: league.day, status: "pending" as const } } : p) }) });
      },
      editAttribute: (playerId, attribute, value) => {
        const league = get().league; if (!league || !franchisePlan(league).commissioner || !Number.isFinite(value)) return;
        const players = league.players.map(p => {
          if (p.id !== playerId || !p.sheet || !(attribute in p.sheet.attributes)) return p;
          const attributes = { ...p.sheet.attributes, [attribute]: clamp(Math.round(value), 25, 99) };
          const overall = clamp(overallFromAttributes(p.position, attributes, { impact: p.ratings.impact, offense: p.ratings.offense, defense: p.ratings.defense }) + (p.sheet.overallOffset ?? 0), 25, 99);
          return { ...p, sheet: { ...p.sheet, attributes, overall } };
        });
        set({ league: withUpdate({ ...league, players }) });
      },
      importDraftClass: (text) => {
        const league = get().league; if (!league || !franchisePlan(league).commissioner) throw new Error("Enable commissioner tools to import a draft class.");
        set({ league: withUpdate(importDraftClassEngine(league, text)) });
      },

      refreshSaves: async () => {
        const index = await readSaveIndex();
        set({ saves: index.saves, activeSaveId: index.activeId });
      },

      newLeague: async (userTeamId = "bos", season, opts) => {
        const replace = opts?.replace ?? false;
        set({ seeding: true, seedError: null });
        if (!replace) {
          const seasonEnd = season
            ? startYearFromCanonicalSeason(season) + 1
            : undefined;
          await allocateNewSave({ userTeamId, season: seasonEnd });
        }
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
          payload.league = withCreationSettings(prepareFranchise(payload.league), opts);
          set({ league: payload.league, lastJourneyNote: null, lastFaNote: null, lastDraftNote: null, seeding: false, seedError: null });
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
          await get().refreshSaves();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to load real rosters";
          set({ seeding: false, seedError: message });
          // Fallback so the user can still play in the allocated slot.
          const league = withCreationSettings(prepareFranchise(createGeneratedLeague({ userTeamId })), opts);
          set({ league });
          useMyLeagueStore.getState().bootstrap(league);
          await get().refreshSaves();
        }
      },

      newGeneratedLeague: (userTeamId = "bos", opts) => {
        const replace = opts?.replace ?? false;
        set({ seeding: true, seedError: null });
        void (async () => {
          if (!replace) {
            await allocateNewSave({ userTeamId });
          }
          const league = withCreationSettings(prepareFranchise(createGeneratedLeague({ userTeamId })), opts);
          set({ league, lastJourneyNote: null, lastFaNote: null, lastDraftNote: null, seeding: false, seedError: null });
          useMyLeagueStore.getState().bootstrap(league);
          await get().refreshSaves();
        })();
      },

      leaveToHub: async () => {
        clearSimTimer();
        set({ simRun: null });
        await parkActiveSave();
        useMyLeagueStore.getState().reset();
        set({ league: null, lastJourneyNote: null, lastFaNote: null, lastDraftNote: null, seedError: null });
        await get().refreshSaves();
      },

      resumeSave: async (id) => {
        clearSimTimer();
        set({ simRun: null, seeding: true, seedError: null });
        try {
          await setActiveSaveId(id);
          const rawA = await readLayerARaw(id);
          if (!rawA) throw new Error("Save data missing");
          const parsed = JSON.parse(rawA) as {
            state?: { league?: GmLeagueState | null };
          };
          const loaded = parsed.state?.league;
          if (!loaded) throw new Error("Save has no league");
          const league = normalizeLoadedLeague(loaded);
          set({ league, lastJourneyNote: null, lastFaNote: null, lastDraftNote: null, seeding: false });

          const rawB = await readLayerBRaw(id);
          if (rawB) {
            const layerB = JSON.parse(rawB) as {
              state?: {
                myLeague?: unknown;
                historical?: unknown;
                simulation?: unknown;
                timeline?: unknown;
                decisions?: unknown;
              };
            };
            const b = layerB.state;
            if (b?.myLeague && b.simulation && b.historical) {
              useMyLeagueStore.setState({
                myLeague: b.myLeague as never,
                historical: b.historical as never,
                simulation: b.simulation as never,
                timeline: (b.timeline as never) ?? {},
                decisions: (b.decisions as never) ?? {},
                hydrated: true,
              });
            } else {
              useMyLeagueStore.getState().bootstrap(league);
            }
          } else {
            useMyLeagueStore.getState().bootstrap(league);
          }
          await get().refreshSaves();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not open save";
          await parkActiveSave();
          set({ league: null, seeding: false, seedError: message });
          await get().refreshSaves();
        }
      },

      deleteSave: async (id) => {
        const deletingActive = get().activeSaveId === id;
        await deleteSaveSlot(id);
        if (deletingActive) {
          clearSimTimer();
          useMyLeagueStore.getState().reset();
          set({ league: null, simRun: null, seedError: null });
        }
        await get().refreshSaves();
      },

      resetLeague: () => {
        void get().leaveToHub();
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
          const nextTeam = { ...t, starters, benchOrder };
          // Keep cover slots aligned with the new starter map.
          // Do not seed a minutes book here — persisting one turns on the
          // coaching ORtg nudge for the user only, and CPU clubs stay at 1.0.
          const book = buildBalancedMinutes(nextTeam, league.players);
          const coverSlot = {
            ...(t.coaching?.coverSlot ?? book.coverSlot),
            ...(playerId ? { [playerId]: position } : {}),
          };
          return {
            ...nextTeam,
            coaching: {
              ...coachingOf(t),
              coverSlot,
            },
          };
        });
        set({ league: withUpdate({ ...league, teams }) });
      },

      setPlayerPosition: (playerId, position) => {
        const league = get().league;
        if (!league) return;
        const players = league.players.map((player) => {
          if (player.id !== playerId || player.teamId !== league.userTeamId) {
            return player;
          }
          return reassignPosition(player, position);
        });
        const teams = league.teams.map((t) => {
          if (t.id !== league.userTeamId) return t;
          const starters = { ...t.starters };
          // If he was starting a slot he can no longer cover, clear that slot.
          for (const slot of Object.keys(starters) as Array<keyof typeof starters>) {
            if (starters[slot] !== playerId) continue;
            if (slot === position) continue;
            // Keep the starter if the new primary or secondary can still cover.
            const next = players.find((p) => p.id === playerId);
            if (
              next &&
              (next.position === slot ||
                next.secondaryPosition === slot ||
                slotAccepts(slot, next.position))
            ) {
              continue;
            }
            starters[slot] = null;
          }
          // Prefer him in the matching starter hole when empty.
          if (!starters[position]) starters[position] = playerId;
          const nextTeam = { ...t, starters };
          const book = buildBalancedMinutes(nextTeam, players);
          return {
            ...nextTeam,
            coaching: {
              ...coachingOf(t),
              coverSlot: {
                ...(t.coaching?.coverSlot ?? book.coverSlot),
                [playerId]: position,
              },
            },
          };
        });
        set({ league: withUpdate({ ...league, players, teams }) });
      },

      setPlayerSecondary: (playerId, position) => {
        const league = get().league;
        if (!league) return;
        const players = league.players.map((player) => {
          if (player.id !== playerId || player.teamId !== league.userTeamId) {
            return player;
          }
          return setSecondaryPosition(player, position);
        });
        // Refresh cover so minutes bars and the sim see the new slide.
        // Do not seed a minutes book — that turns on the coaching ORtg nudge
        // for the user only.
        const teams = league.teams.map((t) => {
          if (t.id !== league.userTeamId) return t;
          const book = buildBalancedMinutes(t, players);
          return {
            ...t,
            coaching: {
              ...coachingOf(t),
              coverSlot: book.coverSlot,
            },
          };
        });
        set({ league: withUpdate({ ...league, players, teams }) });
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
              shifts: patch.shifts ?? (patch.minutes ? undefined : current.shifts),
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
        const book = buildBalancedMinutes(team, league.players);
        const base = team.coaching?.minutes ?? book.minutes;
        const minutesPlan = {
          ...base,
          [playerId]: clamp(Math.round(minutes), 0, 40),
        };
        const player = league.players.find((entry) => entry.id === playerId);
        const coverSlot = {
          ...book.coverSlot,
          ...(team.coaching?.coverSlot ?? {}),
        };
        if (player && (minutesPlan[playerId] ?? 0) > 0 && !coverSlot[playerId]) {
          coverSlot[playerId] = player.position;
        }
        if ((minutesPlan[playerId] ?? 0) <= 0) delete coverSlot[playerId];
        get().setCoaching({
          minutes: minutesPlan,
          coverSlot,
        });
      },

      setRotationDepth: (depth) => {
        const league = get().league;
        if (!league) return;
        const teams = league.teams.map((team) => {
          if (team.id !== league.userTeamId) return team;
          const next = {
            ...team,
            coaching: {
              ...coachingOf(team),
              rotationDepth: depth,
            },
          };
          const { minutes, coverSlot } = buildBalancedMinutes(next, league.players);
          return {
            ...next,
            coaching: {
              ...coachingOf(next),
              rotationDepth: depth,
              minutes,
              coverSlot,
            },
          };
        });
        set({ league: withUpdate({ ...league, teams }) });
      },

      autoBalanceRotation: () => {
        const league = get().league;
        if (!league) return;
        const teams = league.teams.map((team) => {
          if (team.id !== league.userTeamId) return team;
          const { minutes, coverSlot } = buildBalancedMinutes(team, league.players);
          return {
            ...team,
            coaching: {
              ...coachingOf(team),
              minutes,
              coverSlot,
            },
          };
        });
        set({ league: withUpdate({ ...league, teams }) });
      },

      resetRotation: () => {
        const league = get().league;
        if (!league) return;
        const teams = league.teams.map((team) => {
          if (team.id !== league.userTeamId) return team;
          return resetBalancedRotation(team, league.players).team;
        });
        set({ league: withUpdate({ ...league, teams }) });
      },

      simulateNextGame: () => {
        let league = get().league;
        if (!league || league.phase !== "regular") return null;
        if (!myLeagueAllowsSim(league)) return null;
        if (league.checkpointSnooze) {
          league = restoreSnoozedCheckpoint(league);
          if (isTeamBuildingPaused(league)) {
            set({ league: withUpdate(league) });
            syncMyLeague(league);
            return null;
          }
        }
        if (league.incomingOffer || isCalendarPaused(league)) return null;
        const next = league.schedule.find(
          (g) =>
            !g.played &&
            (g.homeTeamId === league.userTeamId ||
              g.awayTeamId === league.userTeamId) &&
            g.day >= league.day
        );
        if (!next) return null;

        // Use the same daily engine and decision gates as the calendar.
        // A next-game action must not skip checkpoints or run a second clock.
        get().stopAutoSim();
        for (let guard = 0; guard < 500; guard++) {
          const before = get().league;
          if (!before || before.phase !== "regular") break;
          get().simulateDay();
          const current = get().league;
          const target = current?.schedule.find(game => game.id === next.id);
          if (target?.played) return target.boxScoreId ?? null;
          if (!current || current.day === before.day || current.incomingOffer || isCalendarPaused(current)) break;
        }
        return null;
      },

      simulateDay: () => {
        let league = get().league;
        if (!league || league.phase !== "regular") return;
        if (!myLeagueAllowsSim(league)) return;
        if (league.checkpointSnooze) {
          league = restoreSnoozedCheckpoint(league);
          if (isTeamBuildingPaused(league)) {
            set({ league: withUpdate(league), simPauseReason: calendarPauseReason(league) });
            syncMyLeague(league);
            get().stopAutoSim();
            return;
          }
        }
        if (league.incomingOffer || isCalendarPaused(league)) {
          set({ simPauseReason: calendarPauseReason(league) });
          get().stopAutoSim();
          return;
        }
        const stepped = stepDay(league);
        const next = afterDayGates(stepped.league);
        set({ league: withUpdate(next), simPauseReason: null });
        syncMyLeague(next);
        if (isCalendarPaused(next) || next.incomingOffer) {
          set({ simPauseReason: calendarPauseReason(next) });
          get().stopAutoSim();
        }
        if (stepped.seasonOver && !isCalendarPaused(next) && !next.incomingOffer) {
          get().advanceToPlayoffs();
        }
      },

      skipAhead: (kind) => {
        const start = get().league;
        if (!start || start.phase !== "regular") return;
        if (!myLeagueAllowsSim(start)) return;
        if (start.incomingOffer || isCalendarPaused(start)) return;
        if (start.checkpointSnooze) {
          const restored = restoreSnoozedCheckpoint(start);
          if (isTeamBuildingPaused(restored)) {
            set({ league: withUpdate(restored) });
            syncMyLeague(restored);
            return;
          }
        }
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
          state = afterDayGates(stepped.league);
          seasonOver = stepped.seasonOver;
          guard += 1;
          if (state.incomingOffer || isCalendarPaused(state)) break;
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
          injuries: newInjuries(
            start.players,
            state.players,
            start.userTeamId,
            state.schedule,
            state.day
          ),
          standings: state.standings,
          teams: state.teams,
        });
        const next = withUpdate({ ...state, digest });
        set({ league: next });
        syncMyLeague(next);
        if (
          seasonOver &&
          !isCalendarPaused(next) &&
          !next.incomingOffer
        ) {
          get().advanceToPlayoffs();
        }
      },

      startAutoSim: (kind) => {
        clearSimTimer();
        set({ simRun: null, simPauseReason: null });
        const start = get().league;
        if (!start || start.phase !== "regular") return;
        if (!myLeagueAllowsSim(start)) return;
        if (start.incomingOffer || isCalendarPaused(start)) {
          set({ simPauseReason: calendarPauseReason(start) });
          return;
        }
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
          if (
            !run ||
            !league ||
            league.phase !== "regular" ||
            league.incomingOffer ||
            isCalendarPaused(league)
          ) {
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
          try { get().simulateDay(); }
          catch (error) {
            set({ simPauseReason: error instanceof Error ? error.message : "Simulation could not advance. Review your roster before resuming." });
            get().stopAutoSim();
            return;
          }
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
          if (
            next.phase !== "regular" ||
            next.incomingOffer ||
            isCalendarPaused(next) ||
            (franchisePlan(next).pauses.injuries && newInjuries(league.players, next.players, next.userTeamId).some(p => p.yours))
          ) {
            set({ simPauseReason: calendarPauseReason(next) ?? (next.phase !== "regular"
              ? "Regular season complete. Continue from the season hub."
              : "Paused for a new injury. Review your rotation, then resume simulation.") });
            get().stopAutoSim();
          }
          if (next === league || (next.day === league.day && next.phase === league.phase)) {
            set({ simPauseReason: "Simulation could not advance. Review the pending decision before resuming." });
            get().stopAutoSim();
          }
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
          const cur = get().league;
          if (
            cur?.phase !== "regular" ||
            cur?.incomingOffer ||
            (cur && isCalendarPaused(cur))
          ) {
            break;
          }
        }
      },

      simulateToPlayoffs: () => {
        if (!get().league || get().league?.phase !== "regular") return;
        let guard = 0;
        while (get().league?.phase === "regular" && guard < 500) {
          get().simulateDay();
          guard += 1;
          const cur = get().league;
          if (cur?.incomingOffer || (cur && isCalendarPaused(cur))) break;
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
          {
            ...league,
            incomingOffer: undefined,
            lastOfferResolvedDay: league.day,
          },
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
        const recorded = recordDeclinedOffer(league, offer);
        const next = withUpdate({
          ...recorded,
          news: [
            {
              id: uid("news"),
              day: league.day,
              season: league.season,
              headline: `You passed on ${caller?.city ?? "the"} offer`,
              body: "That package is dead for a while. They will not bounce it back tomorrow.",
              tone: "info" as const,
            },
            ...league.news,
          ].slice(0, 50),
        });
        set({ league: next });
        syncMyLeague(next);
      },

      pauseForTeamBuilding: () => {
        const league = get().league;
        if (!league?.teamBuildingCheckpoint) return;
        get().stopAutoSim();
        const next = withUpdate(pauseForTeamBuildingEngine(league));
        set({ league: next });
        syncMyLeague(next);
      },

      continuePastCheckpoint: () => {
        const league = get().league;
        if (!league?.teamBuildingCheckpoint) return;
        const kind = league.teamBuildingCheckpoint.kind;
        get().stopAutoSim();
        let next = continuePastCheckpointEngine(league);
        if (
          kind === "season_end" &&
          next.phase === "regular" &&
          regularSeasonComplete(next.schedule)
        ) {
          set({ league: withUpdate(next) });
          syncMyLeague(next);
          get().advanceToPlayoffs();
          return;
        }
        next = considerScoutingFocus(next);
        next = withUpdate(next);
        set({ league: next });
        syncMyLeague(next);
      },

      applyScoutingFocus: (playerIds, positionFocus = null) => {
        const league = get().league;
        if (!league?.scoutingFocusPrompt) return;
        get().stopAutoSim();
        const next = withUpdate(
          applyScoutingFocusEngine(league, playerIds, positionFocus, "manual")
        );
        set({ league: next });
        syncMyLeague(next);
      },

      autoScoutingFocus: () => {
        const league = get().league;
        if (!league?.scoutingFocusPrompt) return;
        get().stopAutoSim();
        const next = withUpdate(autoScoutingFocusEngine(league));
        set({ league: next });
        syncMyLeague(next);
      },

      skipScoutingFocus: () => {
        const league = get().league;
        if (!league?.scoutingFocusPrompt) return;
        get().stopAutoSim();
        const next = withUpdate(skipScoutingFocusEngine(league));
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
        if (!evaluation.ok) {
          const talk = { id: uid("talk"), day: league.day, teamId: toTeamId, reason: evaluation.reason ?? "The other club declined.", youSend: fromAssets, youReceive: toAssets, counter: suggestCounterOffer(league, league.userTeamId, toTeamId, fromAssets, toAssets) };
          set({ league: withUpdate({ ...league, tradeTalks: [talk, ...(league.tradeTalks ?? [])].slice(0, 30) }) });
          return evaluation;
        }
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

      finishDraftBoard: () => {
        const league = get().league;
        if (!league || league.phase !== "draft") return;
        let next =
          league.draftPool.length > 0 ? finishDraftWithAi(league) : league;
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
        if (!league || league.combineDone || (league.seasonFlow?.stage !== "scouting" && !(league.phase === "offseason" && !league.seasonFlow))) return;
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
                body: "Wingspan, vertical and sprint measurements now appear in prospect files. Compare the tests with game film and your roster needs.",
                tone: "info" as const,
              },
              ...league.news,
            ].slice(0, 50),
          }),
        });
      },

      scoutLook: (playerId) => get().scoutProspect(playerId,"film","shooting"),
      scoutProspect: (playerId,method,focus) => {
        const league=get().league;if(!league)return;
        const result=studyProspect(league,playerId,method,focus);
        set({...(result.ok?{league:withUpdate(result.state)}:{}),lastDraftNote:result.reason});
      },
      setDraftStrategy: strategy => {
        const league=get().league;if(!league||!DRAFT_ROLES.some(row=>row.id===strategy))return;
        set({league:withUpdate({...league,draftScouting:{...draftScoutingOf(league),strategy}})});
      },
      toggleDraftWatch: playerId => {
        const league=get().league;if(!league)return;
        set({league:withUpdate(toggleDraftWatch(league,playerId))});
      },
      makeDraftTrade: proposal => {
        const league=get().league;if(!league)return {ok:false,reason:"No franchise loaded."};
        if(proposal.fromTeamId!==league.userTeamId&&proposal.toTeamId!==league.userTeamId)return {ok:false,reason:"Choose a trade involving your club."};
        const result=executeDraftTrade(league,proposal);
        set({...(result.ok?{league:withUpdate(result.state)}:{}),lastDraftNote:result.reason});
        if(result.ok)syncMyLeague(result.state);
        return {ok:result.ok,reason:result.reason};
      },
      setDevelopmentPlan: (playerId,plan) => {
        const league=get().league;if(!league||!["balanced","practice","rotation"].includes(plan))return;
        set({league:withUpdate({...league,players:league.players.map(player=>player.id===playerId&&player.teamId===league.userTeamId?{...player,developmentPlan:plan}:player)})});
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
        const players = [...league.players];
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
          const result = simulateGame(tip, league.teams, players, undefined, league.schedule, league.settings);
          result.game.postseason = "play_in";
          result.box.postseason = "play_in";
          schedule.push(result.game);
          boxScores = [compactSimBox(result.box, league.userTeamId), ...boxScores].slice(0, 400);
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
        const stamped =
          current.phase === "regular" ? stampSeasonAwards(current) : current;
        const league = {
          ...stamped,
          homeFlow: {
            ...stamped.homeFlow,
            // Fresh awards night whenever we leave the regular season.
            awardsSeen:
              current.phase === "regular" ? false : stamped.homeFlow?.awardsSeen,
            championSeen:
              current.phase === "regular" ? false : stamped.homeFlow?.championSeen,
          },
          champion: current.phase === "regular" ? undefined : stamped.champion,
        };
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

      ackAwardsShow: () => {
        const league = get().league;
        if (!league) return;
        const next = withUpdate({
          ...league,
          homeFlow: { ...league.homeFlow, awardsSeen: true },
        });
        set({ league: next });
        syncMyLeague(next);
      },

      ackChampionSplash: () => {
        const league = get().league;
        if (!league?.champion) return;
        const next = withUpdate(beginOffseason(league));
        set({ league: next, lastJourneyNote: "Season review is open. Summer advances one step at a time." });
        syncMyLeague(next);
      },

      simPlayoffDay: () => {
        const league = get().league;
        if (!league?.playoffBracket) return;
        // Finals splash waits on home before the draft desk opens.
        if (league.champion && !league.homeFlow?.championSeen) return;
        const bracket = league.playoffBracket.map((s) => ({ ...s }));
        const schedule = [...league.schedule];
        let boxScores = [...league.boxScores];
        let players = league.players;
        const playersBeforeInjuries = players;

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
          const result = simulateGame(game, league.teams, players, undefined, league.schedule, league.settings);
          result.box.postseason = "playoffs";
          schedule.push(result.game);
          boxScores = [compactSimBox(result.box, league.userTeamId), ...boxScores].slice(0, 400);
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
          league.teams.find((team) => team.id === league.userTeamId)?.staff.trainerLevel ?? 1,
          { teamIds: tonight.flatMap(s => [s.teamAId, s.teamBId]), before: playersBeforeInjuries, trainerByTeam: Object.fromEntries(league.teams.map(t => [t.id, t.staff.trainerLevel])) }
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
            const finals = bracket.find((series) => series.conf === "Finals");
            const snapshot = {
              ...league,
              playoffBracket: bracket,
              schedule,
              boxScores,
              players,
            };
            const champion = finals ? buildChampionResult(snapshot, finals) : null;
            const crowned = rebalanceForInjuryChanges(
              withUpdate({
                ...snapshot,
                champion: champion ?? undefined,
                homeFlow: {
                  ...league.homeFlow,
                  awardsSeen: true,
                  championSeen: false,
                },
                day: league.day + 1,
                news: [
                  {
                    id: uid("news"),
                    day: league.day,
                    season: league.season,
                    headline: champion
                      ? `${(league.teams.find((team) => team.id === champion.teamId)?.abbr ?? "NBA").toUpperCase()} are champions`
                      : "Champions crowned",
                    body: champion
                      ? `Finals MVP is locked. Open home for the splash, then the draft desk.`
                      : "The Finals are over. Open home for the next step.",
                    tone: "good" as const,
                  },
                  ...league.news,
                ].slice(0, 50),
              }),
              playersBeforeInjuries
            );
            set({ league: crowned });
            syncMyLeague(crowned);
            return;
          }
          void winners;
        }

        const playoffState = rebalanceForInjuryChanges(
          withUpdate({
            ...league,
            playoffBracket: bracket,
            schedule,
            boxScores,
            players,
            day: league.day + 1,
          }),
          playersBeforeInjuries
        );
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
          injuries: newInjuries(
            start.players,
            end.players,
            start.userTeamId,
            end.schedule,
            end.day
          ),
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
          const before = get().league;
          if (before?.champion && !before.homeFlow?.championSeen) break;
          get().simPlayoffDay();
          const after = get().league;
          if (after?.champion && !after.homeFlow?.championSeen) break;
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
          injuries: newInjuries(
            start.players,
            end.players,
            start.userTeamId,
            end.schedule,
            end.day
          ),
          standings: end.standings,
          teams: end.teams,
        });
        set({ league: withUpdate({ ...end, digest }) });
      },

      runOffseason: () => get().advanceSeasonJourney(),
      openFreeAgency: () => {
        const league = get().league;
        if (!league || league.phase === "free_agency") return;
        if (league.seasonFlow?.stage !== "rookie_signing") {
          set({ lastJourneyNote: "Complete the current step in the season hub before free agency." });
          return;
        }
        get().advanceSeasonJourney();
      },

      runCpuSignings: () => {
        const league = get().league;
        if (!league || league.phase !== "free_agency") return;
        if (isTeamBuildingPaused(league)) return;
        const next = withUpdate(runCpuFreeAgency(league, { includeUser: false }));
        set({ league: next, lastFaNote: null });
        syncMyLeague(next);
      },

      advanceFaDay: () => {
        let league = get().league;
        if (!league || league.phase !== "free_agency") return;
        if (league.faMarket?.done) return;
        if (league.checkpointSnooze) {
          league = restoreSnoozedCheckpoint(league);
          if (isTeamBuildingPaused(league)) {
            set({ league: withUpdate(league) });
            syncMyLeague(league);
            return;
          }
        }
        if (isTeamBuildingPaused(league)) return;
        const result = advanceFaDayDetailed(league);
        const next = withUpdate(result.state);
        set({
          league: next,
          lastFaNote: result.blocked?.reason ?? null,
        });
        syncMyLeague(next);
      },

      decideTeamOption: (playerId, decision) => {
        const league = get().league;
        if (!league) return;
        const next = withUpdate(applyOptionDecision(league, playerId, decision));
        set({
          league: next,
          lastFaNote:
            decision === "exercise"
              ? "Team option exercised."
              : "Team option declined.",
        });
        syncMyLeague(next);
      },

      tenderQualifyingOffer: (playerId) => {
        const league = get().league;
        if (!league) return;
        const result = tenderQoEngine(league, playerId, league.userTeamId);
        if (!result.ok) {
          set({ lastFaNote: result.reason });
          return;
        }
        const next = withUpdate(result.state);
        set({ league: next, lastFaNote: "Qualifying offer tendered." });
        syncMyLeague(next);
      },

      declineQualifyingOffer: (playerId) => {
        const league = get().league;
        if (!league) return;
        const result = declineQoEngine(league, playerId, league.userTeamId);
        if (!result.ok) {
          set({ lastFaNote: result.reason });
          return;
        }
        const next = withUpdate(result.state);
        set({ league: next, lastFaNote: "Qualifying offer declined." });
        syncMyLeague(next);
      },

      matchOfferSheet: (sheetId) => {
        const league = get().league;
        if (!league) return;
        const result = matchSheetEngine(league, sheetId);
        if (!result.ok) {
          set({ lastFaNote: result.reason });
          return;
        }
        const next = withUpdate(result.state);
        set({ league: next, lastFaNote: result.note });
        syncMyLeague(next);
      },

      declineOfferSheet: (sheetId) => {
        const league = get().league;
        if (!league) return;
        const result = declineSheetEngine(league, sheetId);
        if (!result.ok) {
          set({ lastFaNote: result.reason });
          return;
        }
        const next = withUpdate(result.state);
        set({ league: next, lastFaNote: result.note });
        syncMyLeague(next);
      },

      toggleFaWatchlist: (playerId) => {
        const league = get().league;
        if (!league) return;
        const next = withUpdate(toggleFaWatchlist(league, playerId));
        set({ league: next });
        syncMyLeague(next);
      },

      resignOwnFreeAgent: (playerId) => {
        const league = get().league;
        if (!league) return { ok: false, reason: "No league" };
        const result = resignOwnFreeAgentEngine(league, playerId);
        if (!result.ok) {
          set({ lastFaNote: result.reason });
          return result;
        }
        const next = withUpdate(result.state);
        set({ league: next, lastFaNote: result.note });
        syncMyLeague(next);
        return { ok: true, note: result.note };
      },

      setAutomation: (patch) => {
        const league = get().league;
        if (!league) return;
        let next = withUpdate({
          ...league,
          automation: { ...automationOf(league), ...patch },
        });
        // Turning auto scout on while a month is paused: resolve it now.
        if (patch.autoScout === true && next.scoutingFocusPrompt) {
          next = withUpdate(autoScoutingFocusEngine(next));
        }
        set({ league: next });
        syncMyLeague(next);
      },

      signFreeAgent: (playerId, salaryM, years) => {
        const league = get().league;
        if (!league) return { ok: false, reason: "No league" };
        const result = userOfferFreeAgent(league, playerId, salaryM, years);
        if (result.state) {
          const next = withUpdate(result.state);
          set({
            league: next,
            lastFaNote: result.ok ? result.note : result.reason,
          });
          syncMyLeague(next);
          if (!result.ok) return { ok: false, reason: result.reason };
          const via = next.players.find((p) => p.id === playerId)?.contract?.signedVia;
          return { ok: true, via, note: result.note };
        }
        if (!result.ok) {
          set({ lastFaNote: result.reason });
          return result;
        }
        return { ok: false, reason: "Offer failed." };
      },

      renounceRights: (playerId) => {
        const league = get().league;
        if (!league) return;
        const player = league.players.find((p) => p.id === playerId);
        const hold = player?.lastSalaryM ?? 0;
        const players = league.players.map((p) =>
          p.id === playerId && p.rightsTeamId === league.userTeamId
            ? {
                ...p,
                rightsTeamId: null,
                rightsStartSeason: undefined,
                rightsKind: undefined,
                lastSalaryM: undefined,
                qoStatus: p.qoStatus === "tendered" ? ("declined" as const) : p.qoStatus,
                qoAmountM: undefined,
              }
            : p
        );
        set({
          league: withUpdate({ ...league, players }),
          lastFaNote: `Renounced rights (cleared $${hold.toFixed(1)}M hold). You can still sign him later with cap room or an exception.`,
        });
      },

      waivePlayer: (playerId) => {
        const league = get().league; if (!league) return;
        const next = withUpdate(releasePlayer(league, playerId));
        set({ league: next });
        syncMyLeague(next);
      },

      hireCoach: (coachId, seat) => {
        const league = get().league;
        if (!league) return;
        const team = league.teams.find((entry) => entry.id === league.userTeamId);
        if (!team) return;
        const market = league.coachMarket ?? openCoachMarket();
        const hired = market.find((coach) => coach.id === coachId);
        if (!hired) return;
        const overTax = capStatus(team, league.players, league.settings, cbaSeason(league)).overTax;
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
        const overTax = capStatus(team, league.players, league.settings, cbaSeason(league)).overTax;
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
        const stamped = ensureScoutKnack(hired);
        const team = league.teams.find((entry) => entry.id === league.userTeamId);
        if (!team) return;
        const overTax = capStatus(team, league.players, league.settings, cbaSeason(league)).overTax;
        if (!hireQuote(team, overTax, stamped, "scout").ok) return;
        const teams = league.teams.map((t) => {
          if (t.id !== league.userTeamId) return t;
          return {
            ...t,
            staff: {
              ...t.staff,
              scout: stamped,
              scoutLevel: stamped.eye,
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
                body: `${stamped.yearsExperience} years · ${stamped.expertise} · ${scoutKnackLabel(stamped.knack)} · eye ${stamped.eye}/5. Draft fog re-rolled to their board.`,
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

      hireDeveloper: (developerId) => {
        const league = get().league;
        if (!league) return;
        const market = league.developerMarket ?? [];
        const hired = market.find((d) => d.id === developerId);
        if (!hired) return;
        const team = league.teams.find((entry) => entry.id === league.userTeamId);
        if (!team) return;
        const overTax = capStatus(team, league.players, league.settings, cbaSeason(league)).overTax;
        if (!hireQuote(team, overTax, hired, "developer").ok) return;
        const teams = league.teams.map((t) => {
          if (t.id !== league.userTeamId) return t;
          return {
            ...t,
            staff: {
              ...t.staff,
              developer: hired,
            },
          };
        });
        set({
          league: withUpdate({
            ...league,
            teams,
            developerMarket: market.filter((d) => d.id !== developerId),
            news: [
              {
                id: uid("news"),
                day: league.day,
                season: league.season,
                headline: `Hired ${hired.name} for player development`,
                body: `${hired.yearsExperience} years · ${devKnackLabel(hired.knack)} · touch ${hired.touch}/5.`,
                tone: "info" as const,
              },
              ...league.news,
            ].slice(0, 50),
          }),
        });
      },

      refreshDeveloperMarket: () => {
        const league = get().league;
        if (!league) return;
        set({
          league: withUpdate({
            ...league,
            developerMarket: generateDeveloperMarket(
              league.season * 7723 + league.day * 17 + (league.developerMarket?.length ?? 0),
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
          state.league = normalizeLoadedLeague(state.league);
        }
        void (async () => {
          try {
            await state?.refreshSaves();
          } finally {
            state?.setHydrated(true);
          }
        })();
      },
    }
  )
);

