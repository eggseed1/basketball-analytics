"use client";

import { useEffect, useRef } from "react";

import coverage from "@/one-shot/data/research-coverage.json";
import { AUTO_STRATEGY } from "@/one-shot/engine";
import type { LifeState } from "@/one-shot/types";
import { country, countryFlag, maybeLeague, WORLD_META, type LeagueProfile } from "@/one-shot/world";

import { Btn, Chip } from "./ui";

function evidenceText(l: LeagueProfile) {
  const r = l.research;
  if (r.status === "verified") return `Checked against an official source on ${r.checkedAt}.`;
  if (r.status === "unknown") return "Not confirmed. The official site did not respond or did not list it on the snapshot date.";
  return r.evidence.replace(/ via fetch tool/g, "").replace(/\s*\(\d{3} via fetch tool\)/g, "");
}

const STATUS_TONE = { verified: "green", partial: "amber", unknown: "dim", inactive: "dim", "confirmed-absence": "rose" } as const;

export function SourcesDrawer({ life, onClose }: { life: LifeState | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled])");
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);
  const ids = life ? [...new Set([life.birthplace.countryId, life.residence.countryId, life.placement.countryId])] : [];
  const c = coverage as unknown as { countryCounts: Record<string, number>; leagueCounts: Record<string, number> };
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="os-sources-title"
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-[560px] overflow-y-auto border-l border-[var(--os-border)] bg-[var(--os-page)] p-5 text-[var(--os-text)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="os-sources-title" className="text-[17px] font-semibold">
            Sources and coverage
          </h2>
          <Btn ref={closeRef} onClick={onClose}>
            Close
          </Btn>
        </div>
        <p className="rounded-[5px] border border-[var(--os-border)] bg-[var(--os-panel)] p-3 text-[12.5px]">{WORLD_META.disclaimer}</p>
        <p className="mt-2 font-mono text-[11px] text-[var(--os-dim)]">Snapshot {WORLD_META.worldSnapshotVersion}</p>

        {ids.map((id) => {
          const ct = country(id);
          return (
            <section key={id} className="mt-5">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                {countryFlag(ct.id)} {ct.name} <Chip tone={STATUS_TONE[ct.research.status]}>{ct.research.status}</Chip>
              </h3>
              <p className="mt-1 text-[12px] text-[var(--os-dim)]">{ct.research.reason}</p>
              {ct.note ? <p className="mt-1 text-[12px] text-[var(--os-dim)]">{ct.note}</p> : null}
              {ct.federation ? (
                <p className="mt-1 text-[12px]">
                  Federation: {ct.federation.name} (FIBA {ct.federation.fibaCode}){" "}
                  {ct.federation.website ? (
                    <a className="text-[var(--os-teal)] underline" href={ct.federation.website} target="_blank" rel="noreferrer">
                      site
                    </a>
                  ) : null}
                </p>
              ) : (
                <p className="mt-1 text-[12px] text-[var(--os-dim)]">No FIBA member federation listed for this place.</p>
              )}
              <p className="mt-1 text-[12px] text-[var(--os-dim)]">
                Birth weight: {ct.draw.births !== null ? `${ct.draw.births.toLocaleString("en-US")} births (${ct.draw.year})` : "estimated floor"}. {ct.draw.method}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {[...ct.competitions.domestic, ...ct.competitions.crossBorder, ...ct.competitions.selective].map((lid) => {
                  const l = maybeLeague(lid);
                  if (!l) return null;
                  return (
                    <li key={lid} className="rounded-[4px] border border-[var(--os-border)] bg-[var(--os-panel)] px-2.5 py-1.5 text-[12px]">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{l.name}</span>
                        <Chip tone={STATUS_TONE[l.research.status]}>{l.research.status}</Chip>
                      </span>
                      <span className="block text-[11.5px] text-[var(--os-dim)]">
                        {l.category}. {evidenceText(l)}{" "}
                        {l.research.url ? (
                          <a className="text-[var(--os-teal)] underline" href={l.research.source.startsWith("http") ? l.research.source : l.research.url} target="_blank" rel="noreferrer">
                            source
                          </a>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {ct.routeNotes.map((n) => (
                <p key={n.system} className="mt-2 text-[12px]">
                  <Chip tone={n.basis === "confirmed" ? "green" : "amber"}>{n.basis === "confirmed" ? "sourced" : "model"}</Chip> {n.text}
                </p>
              ))}
            </section>
          );
        })}

        <section className="mt-6">
          <h3 className="text-[14px] font-semibold">Coverage in this snapshot</h3>
          <p className="mt-1 font-mono text-[12px] tabular-nums text-[var(--os-dim)]">
            Places: {Object.entries(c.countryCounts).map(([k, v]) => `${k} ${v}`).join(" · ")}
          </p>
          <p className="mt-1 font-mono text-[12px] tabular-nums text-[var(--os-dim)]">
            Competitions: {Object.entries(c.leagueCounts).map(([k, v]) => `${k} ${v}`).join(" · ")}
          </p>
          <p className="mt-2 text-[12px] text-[var(--os-dim)]">
            Unknown means we could not confirm a competition from a primary source, so the game uses a generic senior club tier there and never invents a league. Your birthplace changes routes, costs, coaching and exposure. It never changes talent.
          </p>
        </section>

        <section className="mt-6">
          <h3 className="text-[14px] font-semibold">Rules the game uses</h3>
          <p className="mt-1 text-[12px] text-[var(--os-dim)]">{WORLD_META.draftRule}</p>
          <p className="mt-1 text-[12px] text-[var(--os-dim)]">
            League strength, coaching, salaries and exposure are game settings, not measured facts. Box scores, offers and contracts are simulated.
          </p>
        </section>

        <section className="mt-6">
          <h3 className="text-[14px] font-semibold">Auto decisions</h3>
          <p className="mt-1 text-[12px] text-[var(--os-dim)]">When auto decisions are on, every choice follows the same fixed rules:</p>
          <ul className="mt-1 list-disc pl-4 text-[12px] text-[var(--os-text)]/90">
            {AUTO_STRATEGY.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
