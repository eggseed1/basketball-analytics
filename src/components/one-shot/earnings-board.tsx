"use client";

import { useRef, useState } from "react";

import { fmtHeight } from "@/one-shot/body";
import { ordinal, type EarningsRow } from "@/one-shot/leaderboard";
import { TIER_LABEL, type CareerSummary, type OutcomeTier } from "@/one-shot/report";
import { countryFlag, maybeCountry } from "@/one-shot/world";

import { Btn, Kv, money, Segmented } from "./ui";

export type AllTimeStatus = "loading" | "ready" | "down";

type Shown = {
  id: string;
  runId?: string;
  boardId?: string;
  name: string;
  earnings?: number;
  birthCountry: string;
  tier: OutcomeTier;
  endedAge?: number;
  tag?: string | null;
  heightCm?: number | null;
  debutAge?: number | null;
  draft?: string | null;
  peak?: string | null;
  honors?: string | null;
  netWorth?: number | null;
  after?: string | null;
  nbaGames?: number | null;
  badges?: string[] | null;
};

function fromCareer(c: CareerSummary): Shown {
  return {
    id: c.runId,
    runId: c.runId,
    boardId: c.boardId,
    name: c.name,
    earnings: c.earnings,
    birthCountry: c.birthCountry,
    tier: c.tier,
    endedAge: c.endedAge,
    tag: c.tag,
    heightCm: c.heightCm,
    debutAge: c.debutAge,
    draft: c.draft,
    peak: c.peak,
    honors: c.honors,
    netWorth: c.netWorth,
    after: c.after,
    nbaGames: c.nbaGames,
    badges: c.badges ?? null,
  };
}

function fromRow(r: EarningsRow): Shown {
  return {
    id: r.boardId,
    boardId: r.boardId,
    name: r.name,
    earnings: r.earnings,
    birthCountry: r.birthCountry,
    tier: r.tier,
    endedAge: r.endedAge,
    tag: r.tag,
    heightCm: r.heightCm,
    debutAge: r.debutAge,
    draft: r.draft,
    peak: r.peak,
    honors: r.honors,
    netWorth: r.netWorth,
    after: r.after,
    nbaGames: r.nbaGames,
    badges: r.badges ?? null,
  };
}

const PREVIEW_ROWS = 10;

export function LetterBoxes({ onEnter }: { onEnter: (tag: string) => void }) {
  const [letters, setLetters] = useState(["", "", ""]);
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const tag = letters.join("");
  const write = (i: number, raw: string) => {
    const chars = raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3 - i).split("");
    if (!chars.length) {
      setLetters((prev) => prev.map((letter, n) => (n === i ? "" : letter)));
      return;
    }
    setLetters((prev) => {
      const next = [...prev];
      chars.forEach((ch, k) => {
        if (i + k < 3) next[i + k] = ch;
      });
      return next;
    });
    refs[Math.min(2, i + chars.length)]?.current?.focus();
  };
  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (tag.length === 3) onEnter(tag);
      }}
    >
      <div className="flex gap-1">
        {letters.map((letter, i) => (
          <input
            key={i}
            ref={refs[i]}
            value={letter}
            aria-label={`Initial ${i + 1}`}
            inputMode="text"
            autoCapitalize="characters"
            maxLength={3}
            onChange={(e) => write(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !letters[i] && i > 0) refs[i - 1]?.current?.focus();
            }}
            className="h-10 w-9 rounded-md border border-[var(--os-border)] bg-[var(--os-panel2)] text-center font-mono text-[18px] font-semibold tracking-normal text-[var(--os-amber)] uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        ))}
      </div>
      <Btn variant="primary" type="submit" disabled={tag.length < 3}>
        Enter
      </Btn>
    </form>
  );
}

/** This device, or every posted life, ranked by career earnings before tax. */
export function EarningsPanel({
  personal,
  allTime,
  allTimeStatus,
  highlightRunId,
  highlightBoardId,
  units = "imperial",
  onStamp,
  defaultWhich = "device",
}: {
  personal: CareerSummary[];
  allTime: EarningsRow[];
  allTimeStatus: AllTimeStatus;
  highlightRunId?: string | null;
  highlightBoardId?: string | null;
  units?: "metric" | "imperial";
  /** Stamp three initials onto a life stored on this device. */
  onStamp?: (id: { runId?: string; boardId?: string }, tag: string) => void;
  defaultWhich?: "device" | "all";
}) {
  const [which, setWhich] = useState<"device" | "all">(defaultWhich);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const device = personal.filter((c) => typeof c.earnings === "number");
  const rows = which === "device" ? device.map(fromCareer) : allTime.map(fromRow);
  const highlight = which === "device" ? highlightRunId : highlightBoardId;
  const highlightIndex = highlight ? rows.findIndex((c) => c.id === highlight) : -1;
  const preview = rows.slice(0, PREVIEW_ROWS);
  const shown = expanded
    ? rows
    : highlightIndex >= PREVIEW_ROWS
      ? [...preview, rows[highlightIndex]!]
      : preview;
  const hiddenCount = Math.max(0, rows.length - (expanded ? rows.length : preview.length));
  const renderRow = (c: Shown, rank: number) => {
    const ct = maybeCountry(c.birthCountry);
    const you = c.id === highlight;
    const open = openId === c.id;
    const canStamp = Boolean(onStamp) && !c.tag && (which === "device" || you);
    return (
      <li key={`${c.id}:${rank}`} className="border-b border-[var(--os-border)]/60 py-1 last:border-b-0" aria-current={you ? "true" : undefined}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpenId(open ? null : c.id)}
          className="grid w-full grid-cols-[1.6rem_minmax(0,1fr)_2.6rem_auto] items-baseline gap-2 rounded-md px-0.5 py-1 text-left text-[12.5px] hover:bg-[var(--os-panel2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="font-mono text-[11px] text-[var(--os-dim)]">{ordinal(rank)}</span>
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
          <span className="text-center font-mono text-[13px] font-semibold tracking-[0.12em] text-[var(--os-amber)]">{c.tag ?? "···"}</span>
          <span className="font-mono text-[12px]">{c.earnings != null ? money(c.earnings) : "—"}</span>
        </button>
        {open ? (
          <div className="pb-2 pl-7 pr-0.5">
            {c.heightCm || c.debutAge != null || c.draft || c.nbaGames || c.peak || c.honors || c.after || c.netWorth != null || c.badges?.length ? (
              <dl>
                {c.heightCm ? <Kv k="Height" v={fmtHeight(c.heightCm, units)} mono /> : null}
                {c.debutAge != null ? <Kv k="NBA debut" v={`Age ${c.debutAge}`} /> : null}
                {c.draft ? <Kv k="Draft" v={c.draft} /> : null}
                {c.nbaGames ? <Kv k="NBA games" v={c.nbaGames} mono /> : null}
                {c.peak ? <Kv k="Best season" v={c.peak} /> : null}
                {c.honors ? <Kv k="Honors" v={c.honors} /> : null}
                {c.after ? <Kv k="After playing" v={c.after} /> : null}
                {c.netWorth != null ? <Kv k="Net worth" v={money(c.netWorth)} mono /> : null}
                {c.badges?.length ? <Kv k="Badges" v={c.badges.join(" · ")} /> : null}
              </dl>
            ) : (
              <p className="py-1.5 text-[12.5px] text-[var(--os-dim)]">This score was posted before the career line was saved.</p>
            )}
            {canStamp ? (
              <div className="mt-2">
                <p className="text-[12px] text-[var(--os-dim)]">Three letters next to this score.</p>
                <LetterBoxes onEnter={(tag) => onStamp?.({ runId: c.runId, boardId: c.boardId }, tag)} />
              </div>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Whose earnings"
        value={which}
        onChange={(next) => {
          setWhich(next);
          setExpanded(false);
          setOpenId(null);
        }}
        options={[
          { value: "device", label: "This device" },
          { value: "all", label: "All-time" },
        ]}
      />
      {rows.some((c) => !c.tag && onStamp && (which === "device" || c.id === highlight)) ? (
        <p className="text-[12px] text-[var(--os-dim)]">Open your row to leave three initials.</p>
      ) : null}
      {which === "all" && allTimeStatus === "loading" ? (
        <p className="text-[12.5px] text-[var(--os-dim)]">Loading the all-time board.</p>
      ) : which === "all" && allTimeStatus === "down" ? (
        <p className="text-[12.5px] text-[var(--os-dim)]">The all-time board is not reachable from here.</p>
      ) : rows.length ? (
        <>
          <ol className="flex flex-col">
            {shown.map((c) => {
              const rank = rows.findIndex((r) => r.id === c.id) + 1;
              return renderRow(c, rank);
            })}
          </ol>
          {rows.length > PREVIEW_ROWS ? (
            <div className="flex flex-wrap items-center gap-2">
              <Btn
                variant="quiet"
                onClick={() => {
                  setExpanded((v) => !v);
                  if (expanded) setOpenId(null);
                }}
              >
                {expanded ? "Show top 10" : `Show all ${rows.length}`}
              </Btn>
              {!expanded && hiddenCount > 0 ? (
                <span className="text-[12px] text-[var(--os-dim)]">
                  {hiddenCount} more below
                  {highlightIndex >= PREVIEW_ROWS ? " · your row is pinned" : ""}
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-[12.5px] text-[var(--os-dim)]">
          {which === "device"
            ? "Finished lives land here, ranked by career earnings before tax. Open a row for badges and the career line. The top 20 stay on this device."
            : "No finished life has been posted yet. The top 50 stay on the all-time board."}
        </p>
      )}
    </div>
  );
}
