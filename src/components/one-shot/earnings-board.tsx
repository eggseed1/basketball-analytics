"use client";

import { useState } from "react";

import { ordinal, type EarningsRow } from "@/one-shot/leaderboard";
import { TIER_LABEL, type CareerSummary, type OutcomeTier } from "@/one-shot/report";
import { countryFlag, maybeCountry } from "@/one-shot/world";

import { money, Segmented } from "./ui";

export type AllTimeStatus = "loading" | "ready" | "down";

type Shown = {
  id: string;
  name: string;
  earnings?: number;
  birthCountry: string;
  tier: OutcomeTier;
  endedAge?: number;
};

function fromCareer(c: CareerSummary): Shown {
  return { id: c.runId, name: c.name, earnings: c.earnings, birthCountry: c.birthCountry, tier: c.tier, endedAge: c.endedAge };
}

function fromRow(r: EarningsRow): Shown {
  return { id: r.boardId, name: r.name, earnings: r.earnings, birthCountry: r.birthCountry, tier: r.tier, endedAge: r.endedAge };
}

/** This device, or every posted life, ranked by career earnings before tax. */
export function EarningsPanel({
  personal,
  allTime,
  allTimeStatus,
  highlightRunId,
  highlightBoardId,
}: {
  personal: CareerSummary[];
  allTime: EarningsRow[];
  allTimeStatus: AllTimeStatus;
  highlightRunId?: string | null;
  highlightBoardId?: string | null;
}) {
  const [which, setWhich] = useState<"device" | "all">("device");
  const device = personal.filter((c) => typeof c.earnings === "number");
  const rows = which === "device" ? device.map(fromCareer) : allTime.map(fromRow);
  const highlight = which === "device" ? highlightRunId : highlightBoardId;
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Whose earnings"
        value={which}
        onChange={setWhich}
        options={[
          { value: "device", label: "This device" },
          { value: "all", label: "All-time" },
        ]}
      />
      {which === "all" && allTimeStatus === "loading" ? (
        <p className="text-[12.5px] text-[var(--os-dim)]">Loading the all-time board.</p>
      ) : which === "all" && allTimeStatus === "down" ? (
        <p className="text-[12.5px] text-[var(--os-dim)]">The all-time board is not reachable from here.</p>
      ) : rows.length ? (
        <ol className="flex flex-col">
          {rows.map((c, i) => {
            const ct = maybeCountry(c.birthCountry);
            const you = c.id === highlight;
            return (
              <li
                key={c.id}
                className="grid grid-cols-[1.6rem_minmax(0,1fr)_auto] items-baseline gap-2 border-b border-[var(--os-border)]/60 py-2 text-[12.5px] last:border-b-0"
                aria-current={you ? "true" : undefined}
              >
                <span className="font-mono text-[11px] text-[var(--os-dim)]">{ordinal(i + 1)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {ct ? `${countryFlag(ct.id)} ` : ""}
                    {c.name}
                    {you ? <span className="text-[var(--os-dim)]"> · you</span> : null}
                  </span>
                  <span className="block truncate text-[11.5px] text-[var(--os-dim)]">
                    {TIER_LABEL[c.tier]}
                    {c.endedAge ? ` · age ${c.endedAge}` : ""}
                  </span>
                </span>
                <span className="font-mono text-[12px]">{c.earnings != null ? money(c.earnings) : "—"}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-[12.5px] text-[var(--os-dim)]">
          {which === "device"
            ? "Finished lives land here, ranked by career earnings before tax. The top 20 stay on this device."
            : "No finished life has been posted yet. The top 50 stay on the all-time board."}
        </p>
      )}
    </div>
  );
}
