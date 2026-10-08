"use client";

import { useEffect, useRef, useState } from "react";

import { fmtHeight, heightPercentile, parentTarget } from "@/one-shot/body";
import { MONTHS } from "@/one-shot/career";
import { MEANS_LABEL } from "@/one-shot/engine";
import type { LifeState } from "@/one-shot/types";
import { birthShare, COUNTRIES, country, countryFlag, domesticProLeagues, PLAYABLE_COUNTRIES } from "@/one-shot/world";

import { Portrait } from "./panels-left";
import { Btn, Chip, Kv, ordinal, Panel, sharePct } from "./ui";

function oneIn(p: number) {
  const n = 1 / p;
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} million` : Math.round(n).toLocaleString("en-US");
}

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
  const share = birthShare(c.id, life.draw);
  const target = parentTarget(f.fatherHeightCm, f.motherHeightCm);
  const nat = c.height;
  const top = domesticProLeagues(c.id)[0];
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <Panel className="p-5 sm:p-7">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--os-dim)]">{life.mode === "daily" ? `Daily life · ${life.dailyDate}` : `Seed ${life.seed}`}</p>
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
        <div className="mt-5 rounded-[5px] border border-[var(--os-border)] bg-[var(--os-page)] px-3 py-2.5">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--os-dim)]">Odds of this birthplace</p>
          <p className="mt-0.5 text-[20px] font-semibold tabular-nums">
            {sharePct(share)} <span className="text-[13px] font-normal text-[var(--os-dim)]">about 1 in {oneIn(share)}</span>
          </p>
          <p className="text-[11.5px] text-[var(--os-dim)]">
            {life.draw === "equal"
              ? `Every place had the same chance (1 of ${PLAYABLE_COUNTRIES.length}).`
              : `Weighted by births per year${c.draw.year ? ` (${c.draw.year})` : ""}${c.draw.estimated ? ", estimated for this place" : ""}.`}
          </p>
        </div>
        <dl className="mt-4 grid gap-x-6 sm:grid-cols-2">
          <Kv k="Family means" v={MEANS_LABEL[f.means]} />
          <Kv k="Family support" v={f.support[0]!.toUpperCase() + f.support.slice(1)} />
          <Kv k="Court access" v={f.courtAccess[0]!.toUpperCase() + f.courtAccess.slice(1)} />
          <Kv
            k="Hometown"
            v={
              {
                capital: "Capital city",
                city: "City",
                town: "Town",
                rural: "Rural",
              }[life.birthplace.localityKind]
            }
          />
          <Kv k="Father" v={`${fmtHeight(f.fatherHeightCm, units)} · ${ordinal(heightPercentile(f.fatherHeightCm, "male", c.id))} pct`} mono />
          <Kv k="Mother" v={`${fmtHeight(f.motherHeightCm, units)} · ${ordinal(heightPercentile(f.motherHeightCm, "female", c.id))} pct`} mono />
          <Kv k="Expected adult height" v={`${fmtHeight(target.low, units)} to ${fmtHeight(target.high, units)}`} mono />
          <Kv k="Most likely" v={fmtHeight(target.mid, units)} mono />
        </dl>
        <p className="mt-2 text-[11.5px] text-[var(--os-dim)]">
          Percentiles compare each parent with adults in {c.name}
          {nat ? `, where men average ${fmtHeight(nat.maleCm, units)} and women ${fmtHeight(nat.femaleCm, units)}` : ""}
          {nat?.basis === "proxy" ? ` (no measured data here, so the game borrows ${COUNTRIES.find((x) => x.iso3 === nat.proxyIso3)?.name ?? nat.proxyIso3}'s averages)` : ""}. The expected height uses
          the mid-parent method. In this model, 95% of sons land in that range.
        </p>
        <dl className="mt-4 grid gap-x-6 sm:grid-cols-2">
          <Kv k="National team" v={c.fibaRank ? `FIBA world #${c.fibaRank.rank}` : c.federation ? "Unranked" : "No FIBA federation"} />
          <Kv k="Top league at home" v={top ? top.name : "None verified"} />
          <Kv k="Economy" v={c.income.label} />
          <Kv k="Coaching access" v={`${Math.round(c.model.coachingAccess)}/100 (model)`} mono />
        </dl>
        <p className="mt-4 text-[12px] text-[var(--os-dim)]">
          Nobody can scout a newborn. His talent will show in how he grows and plays. Where he was born decides which roads are open to him, and his parents decide how tall he is likely to be. It has
          no effect on skill talent.
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
