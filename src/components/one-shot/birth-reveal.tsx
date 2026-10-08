"use client";

import { useEffect, useRef, useState } from "react";

import { fmtHeight } from "@/one-shot/body";
import { MONTHS } from "@/one-shot/career";
import { MEANS_LABEL } from "@/one-shot/engine";
import type { LifeState } from "@/one-shot/types";
import { country, countryFlag } from "@/one-shot/world";

import { Portrait } from "./panels-left";
import { Btn, Chip, Kv, Panel } from "./ui";

export function BirthReveal({
  life,
  units,
  onRename,
  onStart,
  onBack,
}: {
  life: LifeState;
  units: "metric" | "imperial";
  onRename: (given: string, family: string) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const c = country(life.birthplace.countryId);
  const [editing, setEditing] = useState(false);
  const [given, setGiven] = useState(life.identity.givenName);
  const [family, setFamily] = useState(life.identity.familyName);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const f = life.family;
  const tone = c.research.status === "verified" ? "green" : c.research.status === "partial" ? "amber" : "dim";
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <Panel className="p-5 sm:p-7">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--os-dim)]">
          {life.mode === "daily" ? `Daily life · ${life.dailyDate}` : `Seed ${life.seed}`}
        </p>
        <div className="mt-4 flex flex-col items-start gap-5 sm:flex-row">
          <Portrait life={life} size={112} className="rounded-[6px] border border-[var(--os-border)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-[var(--os-dim)]">
              Born {MONTHS[life.identity.birthMonthOfYear - 1]} {life.identity.birthYear}
            </p>
            <h2 ref={heading} tabIndex={-1} className="mt-0.5 text-[26px] font-semibold leading-tight focus:outline-none">
              {life.identity.displayName}
            </h2>
            {editing ? (
              <form
                className="mt-2 flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onRename(given, family);
                  setEditing(false);
                }}
              >
                <label className="flex flex-col text-[11.5px] text-[var(--os-dim)]">
                  Given name
                  <input
                    value={given}
                    maxLength={24}
                    onChange={(e) => setGiven(e.target.value)}
                    className="mt-0.5 min-h-9 w-40 rounded-[4px] border border-[var(--os-border)] bg-[var(--os-page)] px-2 text-[14px] text-[var(--os-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)]"
                  />
                </label>
                <label className="flex flex-col text-[11.5px] text-[var(--os-dim)]">
                  Family name
                  <input
                    value={family}
                    maxLength={24}
                    onChange={(e) => setFamily(e.target.value)}
                    className="mt-0.5 min-h-9 w-40 rounded-[4px] border border-[var(--os-border)] bg-[var(--os-page)] px-2 text-[14px] text-[var(--os-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)]"
                  />
                </label>
                <Btn type="submit">Save</Btn>
              </form>
            ) : (
              <button type="button" className="mt-1 text-[12px] text-[var(--os-dim)] underline hover:text-[var(--os-text)]" onClick={() => setEditing(true)}>
                Rename (cosmetic only)
              </button>
            )}
            <p className="mt-3 text-[15px]">
              {countryFlag(c.id)} {life.birthplace.locality}, {c.name}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--os-dim)]">
              <Chip tone={tone}>{c.research.status}</Chip>
              {c.research.status === "verified" ? "Basketball structure checked for this snapshot." : c.research.reason}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-x-6 sm:grid-cols-2">
          <Kv k="Family means" v={MEANS_LABEL[f.means]} />
          <Kv k="Family support" v={f.support[0]!.toUpperCase() + f.support.slice(1)} />
          <Kv k="Court access" v={f.courtAccess[0]!.toUpperCase() + f.courtAccess.slice(1)} />
          <Kv k="Hometown" v={{ capital: "Capital city", city: "City", town: "Town", rural: "Rural" }[life.birthplace.localityKind]} />
          <Kv k="Father" v={fmtHeight(f.fatherHeightCm, units)} mono />
          <Kv k="Mother" v={fmtHeight(f.motherHeightCm, units)} mono />
        </dl>
        <p className="mt-4 text-[12px] text-[var(--os-dim)]">
          Nobody can scout a newborn. His talent will show in how he grows and plays. Where he was born decides which roads are open to him and has no effect on talent.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Btn variant="primary" className="min-h-11 px-6 text-[15px]" onClick={onStart}>
            Start life
          </Btn>
          <Btn variant="quiet" className="min-h-11" onClick={onBack}>
            Back
          </Btn>
        </div>
      </Panel>
    </div>
  );
}
