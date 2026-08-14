"use client";

/**
 * MyLeague Layer B persist store - Reality + Simulation scaffolding.
 * Franchise Lab Layer A remains in `useGmStore` (`franchise-lab-gm`).
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";
import type { GmLeagueState } from "@/gm/types";
import type {
  DecisionLog,
  HistoricalUniverse,
  MyLeague,
  MyLeagueSettings,
  SimulationUniverse,
  TimelineEvent,
} from "@/gm/myleague/types";
import { createMyLeagueBundle } from "@/gm/myleague/create-myleague";
import {
  advanceMyLeaguePhase,
  clearDecision,
  enqueueDecision,
  gateSimulate,
  recordUserDecision,
  syncControllerFromLeague,
  type SimGateResult,
} from "@/gm/myleague/controller";
import type { PendingDecision } from "@/gm/myleague/types";

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

interface MyLeagueStore {
  myLeague: MyLeague | null;
  historical: HistoricalUniverse | null;
  simulation: SimulationUniverse | null;
  timeline: Record<string, TimelineEvent>;
  decisions: Record<string, DecisionLog>;
  hydrated: boolean;
  setHydrated: (v: boolean) => void;

  /** Create a fresh Layer B shell (always replaces). */
  bootstrap: (
    league: GmLeagueState,
    settings?: Partial<MyLeagueSettings>,
    opts?: { snapshot?: import("@/gm/myleague/types").HistoricalSeasonSnapshot }
  ) => void;
  /** Sync if present; otherwise bootstrap once for legacy saves. */
  ensureBootstrapped: (league: GmLeagueState) => void;
  reset: () => void;
  /** Pull season/phase/day from Layer A. */
  syncFromLeague: (league: GmLeagueState) => void;
  canSimulate: () => SimGateResult;
  advancePhase: (playableOnly?: boolean) => { ok: boolean; reason?: string };
  logDecision: (
    league: GmLeagueState,
    action: string,
    beforeStateRef: string,
    afterStateRef: string
  ) => void;
  addPending: (decision: Omit<PendingDecision, "id"> & { id?: string }) => void;
  resolvePending: (decisionId: string) => void;
}

function touch(ml: MyLeague): MyLeague {
  return { ...ml, updatedAt: new Date().toISOString() };
}

export const useMyLeagueStore = create<MyLeagueStore>()(
  persist(
    (set, get) => ({
      myLeague: null,
      historical: null,
      simulation: null,
      timeline: {},
      decisions: {},
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),

      bootstrap: (league, settings, opts) => {
        const bundle = createMyLeagueBundle(league, settings, opts);
        set({
          myLeague: bundle.myLeague,
          historical: bundle.historical,
          simulation: bundle.simulation,
          timeline: bundle.timeline,
          decisions: {},
        });
      },

      ensureBootstrapped: (league) => {
        if (get().myLeague && get().simulation && get().historical) {
          get().syncFromLeague(league);
          return;
        }
        get().bootstrap(league);
      },

      reset: () =>
        set({
          myLeague: null,
          historical: null,
          simulation: null,
          timeline: {},
          decisions: {},
        }),

      syncFromLeague: (league) => {
        const sim = get().simulation;
        const ml = get().myLeague;
        if (!sim || !ml) return;
        set({
          simulation: syncControllerFromLeague(sim, league),
          myLeague: touch({
            ...ml,
            userTeamId: league.userTeamId,
          }),
        });
      },

      canSimulate: () => {
        const sim = get().simulation;
        if (!sim) return { ok: false, reason: "No MyLeague simulation" };
        return gateSimulate(sim);
      },

      advancePhase: (playableOnly = true) => {
        const sim = get().simulation;
        const ml = get().myLeague;
        if (!sim || !ml) return { ok: false, reason: "No MyLeague save" };
        const result = advanceMyLeaguePhase(sim, { playableOnly });
        if (!result.ok) return { ok: false, reason: result.reason };
        set({
          simulation: result.simulation,
          myLeague: touch(ml),
        });
        return { ok: true };
      },

      logDecision: (league, action, beforeStateRef, afterStateRef) => {
        const sim = get().simulation;
        const ml = get().myLeague;
        if (!sim || !ml) return;
        const { simulation, decision } = recordUserDecision({
          sim,
          league,
          action,
          beforeStateRef,
          afterStateRef,
        });
        set({
          simulation,
          decisions: { ...get().decisions, [decision.id]: decision },
          myLeague: touch(ml),
        });
      },

      addPending: (decision) => {
        const sim = get().simulation;
        if (!sim) return;
        set({ simulation: enqueueDecision(sim, decision) });
      },

      resolvePending: (decisionId) => {
        const sim = get().simulation;
        if (!sim) return;
        set({ simulation: clearDecision(sim, decisionId) });
      },
    }),
    {
      name: "franchise-lab-myleague",
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        myLeague: s.myLeague,
        historical: s.historical,
        simulation: s.simulation,
        timeline: s.timeline,
        decisions: s.decisions,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
