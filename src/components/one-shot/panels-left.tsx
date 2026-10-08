"use client";

import { useEffect, useRef } from "react";

import { FRAME_LABEL, fmtHeight, fmtLength, fmtWeight, heightEstimate, heightPercentile, parentTarget } from "@/one-shot/body";
import { calendar, levelOf, MONTHS, nodeLabel, ROLE_LABEL, STAGE_LABEL, stageOf } from "@/one-shot/career";
import { projectedRange } from "@/one-shot/draft";
import { canDeclareNow, canRetireNow, MEANS_LABEL } from "@/one-shot/engine";
import { archetype, athleticismBar, position, POSITION_LABEL, READINESS_LABEL, readiness, skillBar } from "@/one-shot/skills";
import type { LifeState } from "@/one-shot/types";
import { country, countryFlag } from "@/one-shot/world";

import { drawPortrait } from "./pixel";
import { ageLabel, Bar, Btn, Chip, Kv, money, ordinal, OS, Panel } from "./ui";

type Units = "metric" | "imperial";

export function Portrait({ life, size = 64, className }: { life: Pick<LifeState, "identity" | "ageMonths" | "placement" | "seed">; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stage = life.ageMonths < 36 ? 0 : life.ageMonths < 144 ? 1 : life.ageMonths < 192 ? 2 : 3;
  const { identity, placement, seed } = life;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawPortrait(ctx, { identity, ageMonths: [0, 60, 168, 240][stage]!, placement, seed }, 64);
  }, [identity, placement, stage, seed]);
  return (
    <canvas
      ref={ref}
      width={64}
      height={64}
      role="img"
      aria-label={`Pixel portrait of ${identity.displayName}`}
      className={className}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
    />
  );
}

export function IdentityCard({ life, compact }: { life: LifeState; compact?: boolean }) {
  const born = country(life.birthplace.countryId);
  const res = country(life.residence.countryId);
  const { month, year } = calendar(life);
  const age = life.ageMonths / 12;
  const lvl = levelOf(life);
  const team = life.placement.teamName;
  return (
    <Panel id="os-identity" className={compact ? "p-3" : undefined}>
      <div className="flex items-start gap-3">
        <Portrait life={life} size={compact ? 52 : 64} className="shrink-0 rounded-lg border border-[var(--os-border)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold leading-tight">
            {life.identity.displayName}
            {life.unicorn ? (
              <span className="ml-1.5 align-middle text-[14px]" title="Unicorn seed: rare talent, a gifted frame and a family that can back him" aria-label="Unicorn seed">
                🦄
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-[12.5px] text-[var(--os-dim)]">
            {age >= 10 ? `${POSITION_LABEL[position(life.body.heightCm, life.skills)]} · ${archetype(life)}` : STAGE_LABEL[stageOf(life.ageMonths)]}
          </p>
          <p className="mt-0.5 truncate text-[12.5px]">
            {life.after ? life.after.title : lvl ? lvl.label : nodeLabel(life.placement.node, life.placement.countryId, life.placement.leagueId)}
            {life.after ? <span className="text-[var(--os-dim)]"> · {life.after.employer}</span> : team && life.placement.node !== "home" ? <span className="text-[var(--os-dim)]"> · {team}</span> : null}
          </p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-[var(--os-border)] bg-[var(--os-border)] font-mono text-[11px] uppercase tabular-nums">
        <IdCell k="Age" v={ageLabel(life.ageMonths)} />
        <IdCell k="Date" v={`${MONTHS[month - 1]} ${year}`} />
        <IdCell k="Role" v={life.after ? "Retired" : life.placement.role === "none" ? "—" : ROLE_LABEL[life.placement.role]} />
        <IdCell k="Born" v={`${countryFlag(born.id)} ${born.id}`} title={born.name} />
        <IdCell k="Lives" v={`${countryFlag(res.id)} ${res.id}`} title={`${life.residence.locality}, ${res.name}`} />
        <IdCell k="Citizen" v={life.citizenships.join(" ")} />
      </dl>
    </Panel>
  );
}

function IdCell({ k, v, title }: { k: string; v: string; title?: string }) {
  return (
    <div className="min-w-0 bg-[var(--os-page)] px-2 py-1.5" title={title}>
      <dt className="text-[9.5px] tracking-[0.12em] text-[var(--os-dim)]">{k}</dt>
      <dd className="truncate text-[var(--os-text)]">{v}</dd>
    </div>
  );
}

export function StatusPanel({ life, onDeclare, onRetire }: { life: LifeState; onDeclare?: () => void; onRetire?: () => void }) {
  const age = life.ageMonths / 12;
  const band = readiness(life);
  const declare = onDeclare && canDeclareNow(life);
  const retire = onRetire && canRetireNow(life);
  const { year } = calendar(life);
  const mid = declare ? projectedRange(life, year).mid : null;
  return (
    <Panel id="os-status" title="Status" action={life.after ? <Chip tone="dim">Retired player</Chip> : <Chip tone={band === "nba-ready" || band === "draft-range" ? "green" : band === "radar" ? "teal" : "dim"}>{READINESS_LABEL[band]}</Chip>}>
      <div className="flex flex-col gap-2">
        <Bar label="Health" value={life.condition.health} color={life.condition.injury ? OS.rose : OS.green} />
        <Bar label="Energy" value={life.condition.energy} color={OS.amber} />
        <Bar label="Skill" value={age >= 3 ? skillBar(life) : null} color={OS.teal} hint="Weighted for your position" />
        <Bar label="Athleticism" value={age >= 3 ? athleticismBar(life) : null} color={OS.teal} />
        <Bar label="Confidence" value={life.traits.confidence} color={OS.rose} />
        <Bar label="Exposure" value={age >= 6 ? life.exposure : null} color={OS.green} hint="How much scouts have seen you" />
      </div>
      {life.condition.injury ? (
        <p className="mt-3 rounded-lg border border-[var(--os-rose)]/50 px-2 py-1.5 text-[12px] text-[var(--os-rose)]">
          {life.condition.injury.label}. About {life.condition.injury.monthsLeft} month
          {life.condition.injury.monthsLeft === 1 ? "" : "s"} to heal.
        </p>
      ) : null}
      {declare || retire ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-[var(--os-border)]/60 pt-3">
          {declare ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Btn variant={mid !== null && mid <= 60 ? "primary" : "ghost"} onClick={onDeclare}>
                Declare for the {year} draft
              </Btn>
              <span className="text-[12px] text-[var(--os-dim)]">{mid !== null && mid <= 60 ? `Teams project you around pick ${mid}.` : "Teams project you outside the top 60."} Open until the end of April.</span>
            </div>
          ) : null}
          {retire ? (
            <Btn variant="quiet" className="self-start px-0" onClick={onRetire}>
              Retire from playing…
            </Btn>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

export function PhysiquePanel({ life, units, onUnits }: { life: LifeState; units: Units; onUnits: (u: Units) => void }) {
  const b = life.body;
  const age = life.ageMonths / 12;
  const est = heightEstimate(life);
  const target = parentTarget(life.family.fatherHeightCm, life.family.motherHeightCm);
  const born = country(life.birthplace.countryId);
  return (
    <Panel
      id="os-physique"
      title="Physique"
      action={
        <button
          type="button"
          onClick={() => onUnits(units === "metric" ? "imperial" : "metric")}
          className="rounded-lg border border-[var(--os-border)] px-1.5 py-0.5 font-mono text-[10.5px] uppercase text-[var(--os-dim)] hover:text-[var(--os-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)]"
          aria-label={`Switch to ${units === "metric" ? "imperial" : "metric"} units`}
        >
          {units === "metric" ? "cm/kg" : "ft/lb"}
        </button>
      }
    >
      <dl>
        <Kv k="Height" v={fmtHeight(b.heightCm, units)} mono />
        <Kv k="Weight" v={fmtWeight(b.weightKg, units)} mono />
        <Kv k="Wingspan" v={age >= 6 ? fmtLength(b.wingspanCm, units) : "—"} mono />
        <Kv k="Standing reach" v={age >= 10 ? fmtLength(b.reachCm, units) : "—"} mono />
        <Kv k="Vertical" v={age >= 10 ? fmtLength(b.verticalCm, units) : "—"} mono />
        <Kv k="Frame" v={FRAME_LABEL[b.frame]} />
        <Kv k="Shoots" v={age >= 4 ? (life.identity.hand === "left" ? "Left" : "Right") : "—"} />
        <Kv k="Adult height estimate" v={est ? `${fmtHeight(est.low, units)} to ${fmtHeight(est.high, units)}` : age >= 21 ? "Grown" : "Too early"} mono />
        {age < 21 ? <Kv k="Parents' target" v={`${fmtHeight(target.low, units)} to ${fmtHeight(target.high, units)}`} mono /> : null}
        {age >= 18 ? <Kv k={`Among men in ${born.name}`} v={`${ordinal(heightPercentile(b.heightCm, "male", born.id))} percentile`} mono /> : null}
      </dl>
      {age < 18 ? <p className="mt-2 text-[11.5px] text-[var(--os-dim)]">The range narrows as he grows. No comparisons with adults until he is one.</p> : null}
    </Panel>
  );
}

export function FamilyAndResources({ life, units }: { life: LifeState; units: Units }) {
  const f = life.family;
  const res = country(life.residence.countryId);
  return (
    <Panel id="os-family" title="Family and resources">
      <dl>
        <Kv k="Hometown" v={`${life.birthplace.locality}`} />
        {life.residence.countryId !== life.birthplace.countryId ? <Kv k="Lives in" v={`${life.residence.locality}, ${res.name}`} /> : null}
        <Kv k="Family means" v={MEANS_LABEL[f.means]} />
        <Kv k="Family support" v={cap(f.support)} />
        <Kv k="Court access" v={cap(f.courtAccess)} />
        <Kv k="Parents" v={`${fmtHeight(f.fatherHeightCm, units)} · ${fmtHeight(f.motherHeightCm, units)}`} mono />
        <Kv k="Family savings" v={money(f.savings)} mono />
        <Kv k="Basketball budget" v={`${money(f.monthlyBudget)}/mo`} mono />
        {life.placement.costPerYear > 0 ? <Kv k="Current costs" v={`${money(life.placement.costPerYear)}/yr`} mono /> : null}
        <Kv k="School" v={life.ageMonths >= 72 ? `${cap(life.education.level)} · grades ${Math.round(life.education.academics)}` : "—"} />
        {life.ageMonths >= 168 ? <Kv k="NCAA eligibility" v={life.education.amateur && life.education.ncaaEligible ? "Amateur" : "Lost"} /> : null}
      </dl>
    </Panel>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
