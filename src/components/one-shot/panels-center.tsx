"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { advise, type Advice } from "@/one-shot/advisor";
import { calendar, levelOf, MONTHS, perGame, ROLE_LABEL, STAGE_LABEL, stageOf } from "@/one-shot/career";
import { offerTitle } from "@/one-shot/engine";
import { FOCUSES, focusAvailable, FOCUS_BY_ID, weeklyHours } from "@/one-shot/training";
import type { FocusId, HistoryEntry, LifeState, Offer, Workload } from "@/one-shot/types";
import { country, countryFlag } from "@/one-shot/world";

import { drawScene, SCENE_H, SCENE_W } from "./pixel";
import { Btn, Chip, money, OS, Panel, Segmented } from "./ui";

/* ------------------------------------------------------------ scene */

export function LifeScene({ life, animate }: { life: LifeState; animate: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lifeRef = useRef(life);
  useEffect(() => {
    lifeRef.current = life;
    if (!animate) {
      const ctx = ref.current?.getContext("2d");
      if (ctx) drawScene(ctx, life, 0);
    }
  }, [life, animate]);
  useEffect(() => {
    if (!animate) return;
    let raf = 0;
    let last = 0;
    let frame = 1;
    const loop = (t: number) => {
      if (t - last >= 110) {
        last = t;
        const ctx = ref.current?.getContext("2d");
        if (ctx) drawScene(ctx, lifeRef.current, frame++);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animate]);
  const lvl = levelOf(life);
  const season = life.season;
  const g = life.lastGame;
  const { month, year } = calendar(life);
  return (
    <Panel id="os-scene" className="p-0">
      <canvas
        ref={ref}
        width={SCENE_W}
        height={SCENE_H}
        role="img"
        aria-label={`${STAGE_LABEL[stageOf(life.ageMonths)]} scene: ${lvl?.label ?? "at home"}`}
        className="block aspect-[16/9] w-full rounded-t-[6px]"
        style={{ imageRendering: "pixelated" }}
      />
      <div className="flex flex-col gap-1 border-t border-[var(--os-border)] px-3.5 py-2.5 text-[12.5px]">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--os-dim)]">
            {STAGE_LABEL[stageOf(life.ageMonths)]} · {MONTHS[month - 1]} {year}
          </span>
          {season && season.gp > 0 ? (
            <span className="font-mono tabular-nums">
              {season.gp} GP · {perGame(season, "pts").toFixed(1)} PTS · {perGame(season, "reb").toFixed(1)} REB · {perGame(season, "ast").toFixed(1)} AST
            </span>
          ) : null}
        </div>
        {g && season ? (
          <p className="font-mono text-[11.5px] tabular-nums text-[var(--os-dim)]">
            Last game vs {g.opponent}: {g.pts} pts, {g.reb} reb, {g.ast} ast in {g.min} min ({g.fgm}-{g.fga} FG, {g.tpm}-{g.tpa} 3P, {g.ftm}-{g.fta} FT) ·{" "}
            <span style={{ color: g.teamScore > g.oppScore ? OS.green : OS.rose }}>
              {g.teamScore > g.oppScore ? "W" : "L"} {g.teamScore}-{g.oppScore}
            </span>
          </p>
        ) : (
          <p className="text-[var(--os-dim)]">{lvl ? `${lvl.label}. Season not running.` : life.ageMonths < 36 ? "Growing up." : "No team yet."}</p>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------ focus */

export function FocusPanel({
  life,
  onPlan,
}: {
  life: LifeState;
  onPlan: (p: { primary?: FocusId; secondary?: FocusId | null; workload?: Workload }) => void;
}) {
  const age = life.ageMonths / 12;
  const advice = useMemo(() => advise(life), [life]);
  const hours = weeklyHours(age, life.plan.workload);
  const primary = FOCUS_BY_ID[life.plan.primary];
  const secondary = life.plan.secondary ? FOCUS_BY_ID[life.plan.secondary] : null;
  const cost = (primary.monthlyCost ?? 0) + (secondary?.monthlyCost ?? 0) * 0.5;
  return (
    <Panel id="os-focus" title="Focus this year" action={<span className="font-mono text-[11px] tabular-nums text-[var(--os-dim)]">{age < 3 ? "—" : `${hours} h/week own work`}</span>}>
      {age < 3 ? (
        <p className="text-[12.5px] text-[var(--os-dim)]">Focus opens at age 3. Until then the family sets the routine.</p>
      ) : (
        <>
          <fieldset>
            <legend className="mb-1.5 text-[12px] text-[var(--os-dim)]">Primary focus</legend>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {FOCUSES.map((f) => {
                const ok = focusAvailable(f, age);
                const on = life.plan.primary === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    disabled={!ok}
                    onClick={() => onPlan({ primary: f.id })}
                    title={ok ? f.blurb : f.minAge > age ? `Opens at ${f.minAge}` : `Closed after ${f.maxAge}`}
                    className={`min-h-9 rounded-[4px] border px-2 py-1 text-left text-[12px] leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)] ${
                      on
                        ? "border-[var(--os-teal)] bg-[var(--os-teal)]/12 text-[var(--os-text)]"
                        : ok
                          ? "border-[var(--os-border)] bg-[var(--os-page)] text-[var(--os-text)] hover:border-[var(--os-teal)]/70"
                          : "cursor-not-allowed border-[var(--os-border)]/60 text-[var(--os-dim)]/70"
                    }`}
                  >
                    {f.label}
                    {!ok ? <span className="block font-mono text-[10px] text-[var(--os-dim)]">{f.minAge > age ? `from ${f.minAge}` : `until ${f.maxAge}`}</span> : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <p className="mt-2 text-[12px] text-[var(--os-dim)]">{primary.blurb}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[12px] text-[var(--os-dim)]">
              Secondary focus
              <select
                value={life.plan.secondary ?? ""}
                onChange={(e) => onPlan({ secondary: (e.target.value || null) as FocusId | null })}
                className="min-h-9 rounded-[4px] border border-[var(--os-border)] bg-[var(--os-page)] px-2 text-[13px] text-[var(--os-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)]"
              >
                <option value="">None</option>
                {FOCUSES.filter((f) => focusAvailable(f, age) && f.id !== life.plan.primary).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1 text-[12px] text-[var(--os-dim)]">
              Workload
              <Segmented<Workload>
                label="Workload"
                value={life.plan.workload}
                onChange={(w) => onPlan({ workload: w })}
                options={[
                  { value: "low", label: "Low", hint: "Recover. Fewer gains, fewer injuries." },
                  { value: "balanced", label: "Balanced" },
                  { value: "high", label: "High", hint: "More gains with diminishing returns. Tiring, and injuries get likelier." },
                ]}
              />
            </div>
          </div>
          {cost > 0 ? <p className="mt-2 font-mono text-[11.5px] tabular-nums text-[var(--os-amber)]">Showcases cost the family about {money(cost)} a month.</p> : null}
        </>
      )}
      {advice.length ? <NextMove advice={advice} onPlan={onPlan} /> : null}
    </Panel>
  );
}

function NextMove({ advice, onPlan }: { advice: Advice[]; onPlan: (p: Advice["action"] & object) => void }) {
  return (
    <div className="mt-4 border-t border-[var(--os-border)] pt-3">
      <h3 className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--os-dim)]">Next move</h3>
      <ul className="flex flex-col gap-2">
        {advice.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 text-[12.5px]">
            <div className="min-w-0">
              <p>{a.text}</p>
              <p className="text-[11.5px] text-[var(--os-dim)]">{a.why}</p>
            </div>
            {a.action ? (
              <Btn className="min-h-8 shrink-0 px-2.5 text-[12px]" onClick={() => onPlan(a.action!)}>
                Apply
              </Btn>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ decision */

export function DecisionPanel({
  life,
  onChoose,
  onMinimize,
  headingRef,
}: {
  life: LifeState;
  onChoose: (id: string) => void;
  onMinimize: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const d = life.pendingDecision!;
  const offers = d.offers ?? [];
  const offerById = new Map(offers.map((o) => [o.id, o]));
  return (
    <section
      id="os-decision"
      aria-labelledby="os-decision-title"
      className="rounded-[6px] border border-[var(--os-amber)]/70 bg-[var(--os-panel)] p-3.5"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--os-amber)]">Decision · time is paused</p>
          <h2 id="os-decision-title" ref={headingRef} tabIndex={-1} className="mt-0.5 text-[16px] font-semibold focus:outline-none">
            {d.title}
          </h2>
        </div>
        <Btn variant="quiet" className="min-h-8 px-2 text-[12px]" onClick={onMinimize} aria-label="Hide decision for now">
          Hide
        </Btn>
      </div>
      <p className="text-[13px] text-[var(--os-text)]/90">{d.body}</p>
      <ol className="mt-3 flex flex-col gap-2">
        {d.choices.map((c, i) => {
          const o = offerById.get(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                disabled={Boolean(c.disabled)}
                onClick={() => onChoose(c.id)}
                className="group flex w-full flex-col gap-1 rounded-[5px] border border-[var(--os-border)] bg-[var(--os-page)] px-3 py-2.5 text-left transition-colors hover:border-[var(--os-teal)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-medium">
                    <span className="mr-2 font-mono text-[11px] text-[var(--os-dim)]">{i + 1}</span>
                    {o ? offerTitle(o) : c.label}
                  </span>
                  {o ? <OfferMoney o={o} /> : null}
                </span>
                {o ? <OfferDetail o={o} /> : <span className="text-[12px] text-[var(--os-dim)]">{c.preview}</span>}
                {c.disabled ? <span className="text-[12px] text-[var(--os-rose)]">{c.disabled}</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function OfferMoney({ o }: { o: Offer }) {
  if (o.salary > 0) return <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--os-green)]">{money(o.salary)}/yr · {o.years}y</span>;
  if (o.costPerYear > 0) return <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--os-amber)]">costs {money(o.costPerYear)}/yr</span>;
  return <span className="shrink-0 font-mono text-[12px] text-[var(--os-dim)]">free</span>;
}

function OfferDetail({ o }: { o: Offer }) {
  const c = country(o.countryId);
  return (
    <span className="flex flex-col gap-1 text-[12px]">
      <span className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums text-[var(--os-dim)]">
        <span>
          {countryFlag(c.id)} {c.name}
        </span>
        <span>{ROLE_LABEL[o.role]} · {o.minutesBand}</span>
        <span>Coaching {Math.round(o.coaching)}</span>
        <span title="How hard minutes will be to earn, out of 100">Difficulty {Math.round(o.difficulty)}</span>
        <span>Exposure {Math.round(o.exposure)}</span>
      </span>
      <span className="text-[var(--os-text)]/85">{o.reason}</span>
      {o.consequences.length ? (
        <ul className="list-disc pl-4 text-[var(--os-dim)]">
          {o.consequences.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------ record */

type RecordFilter = "all" | "choices" | "seasons" | "health";

export function LifeRecord({ life }: { life: LifeState }) {
  const [tab, setTab] = useState<"story" | "seasons">("story");
  const [filter, setFilter] = useState<RecordFilter>("all");
  const byId = useMemo(() => new Map(life.history.map((h) => [h.id, h])), [life.history]);
  const entries = useMemo(() => {
    const keep = (h: HistoryEntry) =>
      filter === "all" ||
      (filter === "choices" && (h.kind === "decision" || h.kind === "move" || h.kind === "draft")) ||
      (filter === "seasons" && (h.kind === "season" || h.kind === "milestone")) ||
      (filter === "health" && h.kind === "injury");
    return life.history.filter(keep).slice(-80).reverse();
  }, [life.history, filter]);
  return (
    <Panel
      id="os-record"
      title="Life record"
      action={
        <Segmented<"story" | "seasons">
          label="Record view"
          value={tab}
          onChange={setTab}
          options={[
            { value: "story", label: "Story" },
            { value: "seasons", label: "Seasons" },
          ]}
        />
      }
    >
      {tab === "story" ? (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Filter life record">
            {(["all", "choices", "seasons", "health"] as RecordFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-[4px] border px-2 py-0.5 font-mono text-[11px] capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)] ${
                  filter === f ? "border-[var(--os-teal)] text-[var(--os-text)]" : "border-[var(--os-border)] text-[var(--os-dim)]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <ol className="max-h-[340px] overflow-y-auto pr-1" aria-live="off">
            {entries.map((h) => {
              const cause = h.causeId ? byId.get(h.causeId) : null;
              return (
                <li key={h.id} id={`os-${h.id}`} tabIndex={-1} className="grid grid-cols-[44px_1fr] gap-2 border-b border-[var(--os-border)]/50 py-1.5 text-[12.5px] last:border-b-0 focus:outline-none focus-visible:bg-[var(--os-panel2)]">
                  <span className="font-mono text-[11px] tabular-nums text-[var(--os-dim)]">{Math.floor(h.month / 12)}y{h.month % 12 ? ` ${h.month % 12}m` : ""}</span>
                  <span>
                    <span style={{ color: h.tone === "good" ? OS.green : h.tone === "bad" ? OS.rose : undefined }}>{h.text}</span>
                    {cause ? (
                      <button
                        type="button"
                        className="mt-0.5 block text-left text-[11.5px] text-[var(--os-dim)] underline decoration-dotted underline-offset-2 hover:text-[var(--os-text)]"
                        onClick={() => {
                          setFilter("all");
                          requestAnimationFrame(() => document.getElementById(`os-${cause.id}`)?.focus());
                        }}
                      >
                        Because: {cause.text.length > 80 ? `${cause.text.slice(0, 78)}…` : cause.text}
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
            {entries.length === 0 ? <li className="py-2 text-[12.5px] text-[var(--os-dim)]">Nothing here yet.</li> : null}
          </ol>
        </>
      ) : (
        <SeasonTable life={life} />
      )}
    </Panel>
  );
}

export function SeasonTable({ life }: { life: LifeState }) {
  const rows = [...life.seasons, ...(life.season && life.season.gp > 0 ? [life.season] : [])].slice().reverse();
  if (!rows.length) return <p className="text-[12.5px] text-[var(--os-dim)]">No organized seasons yet.</p>;
  const pct = (m: number, a: number) => (a ? `${((m / a) * 100).toFixed(0)}` : "—");
  return (
    <div className="max-h-[340px] overflow-auto">
      <table className="w-full min-w-[560px] border-collapse font-mono text-[11.5px] tabular-nums">
        <thead className="sticky top-0 bg-[var(--os-panel)] text-[var(--os-dim)]">
          <tr className="text-right [&>th]:px-1.5 [&>th]:py-1 [&>th]:font-normal">
            <th className="text-left">Age</th>
            <th className="text-left">Level</th>
            <th className="text-left">Role</th>
            <th>GP</th>
            <th>MIN</th>
            <th>PTS</th>
            <th>REB</th>
            <th>AST</th>
            <th>FG%</th>
            <th>3P%</th>
            <th>FT%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-[var(--os-border)]/50 text-right [&>td]:px-1.5 [&>td]:py-1">
              <td className="text-left">{r.ageYears}</td>
              <td className="max-w-[180px] truncate text-left font-sans" title={`${r.levelLabel}${r.teamName ? ` · ${r.teamName}` : ""}`}>
                {r.levelLabel}
              </td>
              <td className="text-left font-sans text-[var(--os-dim)]">{ROLE_LABEL[r.role]}</td>
              <td>{r.gp}</td>
              <td>{perGame(r, "min").toFixed(1)}</td>
              <td>{perGame(r, "pts").toFixed(1)}</td>
              <td>{perGame(r, "reb").toFixed(1)}</td>
              <td>{perGame(r, "ast").toFixed(1)}</td>
              <td>{pct(r.fgm, r.fga)}</td>
              <td>{pct(r.tpm, r.tpa)}</td>
              <td>{pct(r.ftm, r.fta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 font-sans text-[11px] text-[var(--os-dim)]">A blank percentage means no attempts, not 0%.</p>
    </div>
  );
}

export function DecisionWaiting({ life, onOpen }: { life: LifeState; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-[6px] border border-[var(--os-amber)]/70 bg-[var(--os-panel)] px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-amber)]"
    >
      <span>
        <span className="block font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--os-amber)]">Decision waiting</span>
        <span className="text-[13.5px]">{life.pendingDecision?.title}</span>
      </span>
      <Chip tone="amber">Open</Chip>
    </button>
  );
}
