"use client";

import { fmtHeight } from "@/one-shot/body";
import { routeView } from "@/one-shot/routes";
import { READINESS_LABEL, READINESS_ORDER, scoutingReport } from "@/one-shot/skills";
import type { LifeState, NodeKind } from "@/one-shot/types";
import { country, countryFlag } from "@/one-shot/world";

import { jerseyColor } from "./pixel";
import { Btn, Chip, OS, Panel } from "./ui";

type Units = "metric" | "imperial";

export function SameGeneration({ life, units }: { life: LifeState; units: Units }) {
  return (
    <Panel id="os-peers" title="Same generation">
      <p className="-mt-1 mb-2 text-[11.5px] text-[var(--os-dim)]">Four fictional kids born the same year. Their lives run on their own dice.</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {life.peers.map((p) => {
          const c = country(p.countryId);
          const last = p.log[p.log.length - 1];
          return (
            <li key={p.id} className="rounded-lg border border-[var(--os-border)] bg-[var(--os-page)] px-2.5 py-2">
              <p className="truncate text-[13px] font-medium">
                {countryFlag(c.id)} {p.name}
              </p>
              <p className="truncate font-mono text-[11px] tabular-nums text-[var(--os-dim)]">
                {c.name} · {life.ageMonths >= 216 ? fmtHeight(p.heightCm, units) : "—"}
              </p>
              <p className="mt-1 truncate text-[12px]" title={p.levelLabel}>
                {p.status}
              </p>
              {last ? <p className="truncate text-[11px] text-[var(--os-dim)]" title={last.text}>{last.text}</p> : null}
              {p.debutMonth !== null ? <Chip tone="green">NBA debut</Chip> : p.drafted ? <Chip tone="teal">Pick {p.drafted.pick}</Chip> : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const NODE_RANK: Partial<Record<NodeKind, number>> = {
  playground: 1,
  "school-team": 2,
  "local-club": 3,
  "local-senior": 4,
  "elite-youth": 5,
  "us-high-school": 5,
  university: 6,
  "domestic-pro": 7,
  "foreign-pro": 7,
  "g-league": 8,
  nba: 9,
};

export function CareerMap({ life }: { life: LifeState }) {
  const nowYear = Math.floor(life.ageMonths / 12);
  const last = Math.max(30, nowYear);
  const tiles = Array.from({ length: last + 1 }, (_, y) => {
    const seasons = [...life.seasons, ...(life.season ? [life.season] : [])].filter((s) => s.ageYears === y);
    const top = seasons.sort((a, b) => (NODE_RANK[b.node] ?? 0) - (NODE_RANK[a.node] ?? 0))[0];
    const yearEntries = life.history.filter((h) => Math.floor(h.month / 12) === y);
    const injury = yearEntries.some((h) => h.kind === "injury");
    const drafted = life.achievements.drafted && Math.floor(life.achievements.drafted.month / 12) === y;
    const debut = life.achievements.nbaDebut !== null && Math.floor(life.achievements.nbaDebut / 12) === y;
    const moved = yearEntries.some((h) => h.kind === "move" && h.text.startsWith("Moved to"));
    return { y, top, injury, drafted, debut, moved, future: y > nowYear };
  });
  return (
    <Panel id="os-map" title="Career map">
      <ol className="grid grid-cols-8 gap-1 sm:grid-cols-[repeat(16,minmax(0,1fr))] lg:grid-cols-8">
        {tiles.map((t) => {
          const color = t.top ? jerseyColor(t.top.node, life.seed, t.top.teamName) : null;
          const label = `Age ${t.y}: ${t.future ? "not lived yet" : t.top ? `${t.top.levelLabel}${t.top.teamName ? `, ${t.top.teamName}` : ""}` : "no organized season"}${t.injury ? ", injury" : ""}${t.moved ? ", moved country" : ""}${t.drafted ? ", drafted" : ""}${t.debut ? ", NBA debut" : ""}`;
          return (
            <li
              key={t.y}
              title={label}
              aria-label={label}
              className={`relative flex aspect-square items-center justify-center rounded-[3px] font-mono text-[9.5px] tabular-nums ${
                t.future ? "border border-dashed border-[var(--os-border)] text-[var(--os-dim)]/50" : t.y === nowYear ? "ring-1 ring-[var(--os-text)]" : ""
              }`}
              style={!t.future ? { background: color ? `${color}55` : OS.panel2, color: OS.text } : undefined}
            >
              {t.debut ? "★" : t.drafted ? "D" : t.y}
              {t.injury ? <span aria-hidden className="absolute right-0.5 top-0.5 h-1 w-1 rounded-full bg-[var(--os-rose)]" /> : null}
              {t.moved ? <span aria-hidden className="absolute bottom-0.5 left-0.5 h-1 w-1 rounded-full bg-[var(--os-amber)]" /> : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-[var(--os-dim)]">One tile per year. Red dot: injury. Amber dot: moved country. D: drafted. ★: NBA debut.</p>
    </Panel>
  );
}

export function YourRoute({ life, onSources }: { life: LifeState; onSources: () => void }) {
  const steps = routeView(life);
  const res = country(life.residence.countryId);
  return (
    <Panel id="os-route" title="Your route" action={<Btn variant="quiet" className="min-h-7 px-1.5 text-[11.5px]" onClick={onSources}>Sources</Btn>}>
      <ol className="flex flex-col">
        {steps.slice(-9).map((s, i) => (
          <li key={`${s.label}-${i}`} className="grid grid-cols-[14px_1fr] gap-2 py-1">
            <span
              aria-hidden
              className="mt-1 h-2.5 w-2.5 rounded-full border"
              style={{
                background: s.status === "done" ? OS.dim : s.status === "current" ? OS.teal : "transparent",
                borderColor: s.status === "open" ? OS.green : s.status === "locked" ? OS.border : "transparent",
              }}
            />
            <span className="min-w-0">
              <span className={`block truncate text-[12.5px] ${s.status === "locked" ? "text-[var(--os-dim)]" : ""}`}>
                {s.label}
                <span className="sr-only"> ({s.status})</span>
              </span>
              {s.detail ? <span className="block truncate text-[11px] text-[var(--os-dim)]" title={s.detail}>{s.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {res.routeNotes.length ? (
        <div className="mt-2 border-t border-[var(--os-border)] pt-2">
          {res.routeNotes.slice(0, 2).map((n) => (
            <p key={n.system} className="mb-1.5 text-[11.5px] text-[var(--os-dim)]">
              <Chip tone={n.basis === "confirmed" ? "green" : "amber"}>{n.basis === "confirmed" ? "sourced" : "model"}</Chip> {n.text}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-2 border-t border-[var(--os-border)] pt-2 text-[11.5px] text-[var(--os-dim)]">
          {res.name}: {res.research.status === "verified" ? "competition structure verified." : res.research.reason}
        </p>
      )}
    </Panel>
  );
}

export function ScoutingReportPanel({ life }: { life: LifeState }) {
  const r = scoutingReport(life);
  const idx = READINESS_ORDER.indexOf(r.band);
  return (
    <Panel id="os-scouting" title="Scouting report">
      <ol className="mb-3 grid grid-cols-6 gap-0.5" aria-label={`NBA readiness: ${READINESS_LABEL[r.band]}`}>
        {READINESS_ORDER.map((b, i) => (
          <li
            key={b}
            title={READINESS_LABEL[b]}
            className="h-2 rounded-[2px]"
            style={{ background: i <= idx && r.band !== "too-early" ? (i >= 4 ? OS.green : i >= 3 ? OS.teal : OS.dim) : OS.page }}
          />
        ))}
      </ol>
      <p className="mb-2 text-[13px] font-medium">{READINESS_LABEL[r.band]}</p>
      {r.strengths.length || r.concerns.length ? (
        <div className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div>
            <h3 className="mb-0.5 text-[11px] uppercase tracking-[0.1em] text-[var(--os-green)]">Strengths</h3>
            <ul className="text-[var(--os-text)]/90">{r.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
          <div>
            <h3 className="mb-0.5 text-[11px] uppercase tracking-[0.1em] text-[var(--os-rose)]">Concerns</h3>
            <ul className="text-[var(--os-text)]/90">{r.concerns.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        </div>
      ) : null}
      {r.roles.length ? <p className="mt-2 text-[12px] text-[var(--os-dim)]">Projects as: {r.roles.join(" · ")}</p> : null}
      {r.evidence.length ? (
        <div className="mt-2">
          <h3 className="mb-0.5 text-[11px] uppercase tracking-[0.1em] text-[var(--os-dim)]">Evidence</h3>
          <ul className="list-disc pl-4 text-[12px] text-[var(--os-text)]/85">{r.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      ) : null}
      <p className="mt-2 text-[11.5px] text-[var(--os-dim)]">Uncertainty: {r.uncertainty}</p>
    </Panel>
  );
}
