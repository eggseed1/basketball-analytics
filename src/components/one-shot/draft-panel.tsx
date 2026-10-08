"use client";

import { useMemo } from "react";

import { fmtHeight, fmtLength, fmtWeight } from "@/one-shot/body";
import { calendar } from "@/one-shot/career";
import { projectedRange, projectedRank } from "@/one-shot/draft";
import type { DraftPick, LifeState } from "@/one-shot/types";
import { countryFlag } from "@/one-shot/world";

import { kitFor } from "./kit";
import { Chip, EYEBROW, ordinal, Panel } from "./ui";

type Units = "metric" | "imperial";

/** Shown from declaring until the summer after the draft. */
export function draftPanelVisible(life: LifeState): boolean {
  const { year, month } = calendar(life);
  if (life.after) return false;
  if (life.draft.declaredYear === year) return true;
  return life.draft.result?.year === year && month <= 9 && life.draft.board !== null;
}

function Cell({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-[var(--os-page)] px-2.5 py-2" title={hint}>
      <p className={EYEBROW}>{k}</p>
      <p className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">{v}</p>
    </div>
  );
}

function verdict(delta: number) {
  return delta >= 0.5 ? <Chip tone="green">Went well</Chip> : delta <= -0.5 ? <Chip tone="rose">Went badly</Chip> : <Chip>Hard to read</Chip>;
}

export function DraftPanel({ life, units }: { life: LifeState; units: Units }) {
  const { year } = calendar(life);
  const d = life.draft;
  const pre = d.declaredYear === year;
  const proj = useMemo(() => {
    if (!pre) return null;
    const r = projectedRange(life, year);
    const before = projectedRank(life, year, -d.stock);
    return { ...r, moved: before - r.mid };
  }, [life, year, pre, d.stock]);
  const c = d.combine?.year === year ? d.combine : null;

  return (
    <Panel id="os-draft" title={`${year} NBA Draft`} action={d.promise && pre ? <Chip tone="green">Promise: {d.promise.team}</Chip> : null}>
      {proj ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Cell k="Projected" v={proj.best > 60 ? "Outside the top 60" : proj.worst > 60 ? `Pick ${proj.best} or later` : proj.best === proj.worst ? `Pick ${proj.mid}` : `Picks ${proj.best}–${proj.worst}`} hint="Where teams have you today. Draft night adds noise, less of it the more scouts have seen you." />
          <Cell k="Since declaring" v={proj.moved === 0 ? "No change" : proj.moved > 0 ? `Up ${proj.moved} ${proj.moved === 1 ? "spot" : "spots"}` : `Down ${-proj.moved} ${proj.moved === -1 ? "spot" : "spots"}`} hint="Combine, interviews and workouts" />
          <Cell k="Next" v={!c ? "Combine in May" : d.interviews.length < 3 && (c.invited || d.interviews.length > 0) ? `Interview ${d.interviews.length + 1} of 3` : !d.workouts && c.invited ? "Workouts" : "Draft night"} />
        </div>
      ) : null}

      {!pre && d.result?.year === year ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Cell k="Pick" v={d.result.pick ? `${ordinal(d.result.pick)} overall` : "Undrafted"} />
          <Cell k="Round" v={d.result.pick ? (d.result.pick <= 30 ? "First" : "Second") : "—"} />
          <Cell k="Team" v={d.result.team ?? "—"} />
        </div>
      ) : null}

      {c ? (
        <div className="mt-3">
          <p className={EYEBROW}>Combine</p>
          {c.invited ? (
            <dl className="mt-1.5 grid grid-cols-1 gap-x-5 text-[12.5px] min-[420px]:grid-cols-2">
              <Measure k="Height, barefoot" v={fmtHeight(c.heightCm, units)} />
              <Measure k="Wingspan" v={fmtLength(c.wingspanCm, units)} />
              <Measure k="Standing reach" v={fmtLength(c.reachCm, units)} />
              <Measure k="Weight" v={fmtWeight(c.weightKg, units)} />
              <Measure k="Lane agility" v={`${c.laneAgilitySec.toFixed(2)} s`} />
              <Measure k="¾-court sprint" v={`${c.sprintSec.toFixed(2)} s`} />
            </dl>
          ) : (
            <p className="mt-1 text-[12px] text-[var(--os-dim)]">Not invited. About 75 prospects get the call. Teams will go on film and word of mouth.</p>
          )}
        </div>
      ) : null}

      {d.interviews.length > 0 && (pre || d.result?.year === year) ? (
        <div className="mt-3">
          <p className={EYEBROW}>Interviews</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {d.interviews.map((iv, i) => (
              <li key={i} className="rounded-lg bg-[var(--os-page)] px-2.5 py-2 text-[12.5px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{iv.team}</span>
                  {verdict(iv.delta)}
                </div>
                <p className="mt-0.5 text-[var(--os-dim)]">{iv.question}</p>
                <p className="mt-0.5">“{iv.answer}”</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!pre && d.board && d.result?.year === year ? <Board life={life} board={d.board} pick={d.result.pick} /> : null}

      <p className="mt-3 text-[11px] text-[var(--os-dim)]">Game rules: the order is reshuffled each year with no lottery odds, and every other prospect is fictional.</p>
    </Panel>
  );
}

function Measure({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-[var(--os-border)]/60 py-1">
      <dt className="text-[var(--os-dim)]">{k}</dt>
      <dd className="font-mono tabular-nums">{v}</dd>
    </div>
  );
}

function Board({ life, board, pick }: { life: LifeState; board: DraftPick[]; pick: number | null }) {
  const at = pick ?? 61;
  const rows = pick ? board.slice(Math.max(0, at - 4), Math.min(board.length, at + 3)) : board.slice(-5);
  return (
    <div className="mt-3">
      <p className={EYEBROW}>{pick ? `Draft board around pick ${pick}` : "The last picks"}</p>
      <ol className="mt-1.5 flex flex-col gap-1">
        {rows.map((p) => {
          const kit = kitFor(life.seed, "nba", p.team);
          return (
            <li key={p.pick} className={`grid grid-cols-[34px_12px_1fr] items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] ${p.isPlayer ? "bg-[var(--os-panel2)] ring-1 ring-[var(--os-teal)]" : "bg-[var(--os-page)]"}`}>
              <span className="font-mono tabular-nums text-[var(--os-dim)]">{ordinal(p.pick)}</span>
              <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: kit.primary, boxShadow: `inset 0 0 0 2px ${kit.secondary}` }} />
              <span className="min-w-0 truncate">
                <span className={p.isPlayer ? "font-semibold" : undefined}>
                  {countryFlag(p.countryId)} {p.name}
                </span>
                <span className="text-[var(--os-dim)]"> · {p.team}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {!pick ? <p className="mt-1.5 text-[12px] text-[var(--os-dim)]">You were not one of the 60 picks.</p> : null}
    </div>
  );
}
