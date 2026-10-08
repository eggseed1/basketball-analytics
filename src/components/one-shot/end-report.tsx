"use client";

import { useEffect, useRef, useState } from "react";

import { fmtHeight } from "@/one-shot/body";
import { perGame } from "@/one-shot/career";
import { netWorth } from "@/one-shot/finance";
import { awardCount, honorsLine, medalCount, outcomeTier, shareText, TIER_LABEL } from "@/one-shot/report";
import type { LifeState } from "@/one-shot/types";
import { country, countryFlag } from "@/one-shot/world";

import { Portrait } from "./panels-left";
import { SeasonTable } from "./stats-panel";
import { shareCardPng } from "./pixel";
import { Btn, Chip, Kv, money, Panel } from "./ui";

export function EndReport({ life, units, onNew, onHome }: { life: LifeState; units: "metric" | "imperial"; onNew: () => void; onHome: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const tier = outcomeTier(life);
  const born = country(life.birthplace.countryId);
  const origin = typeof window === "undefined" ? "https://drbl.io" : window.location.origin;
  const text = shareText(life, origin);
  const link = text.split("\n").at(-1)!;
  const route = [...new Set(life.seasons.filter((s) => s.ageYears >= 12).map((s) => s.levelLabel))];
  const best = [...life.seasons].filter((s) => s.gp >= 5).sort((a, b) => b.strength - a.strength || perGame(b, "pts") - perGame(a, "pts"))[0];
  const medals = medalCount(life);
  const medalLabel = (["gold", "silver", "bronze"] as const)
    .filter((k) => medals[k])
    .map((k) => `${medals[k]} ${k}`)
    .join(", ");
  const awards = awardCount(life);
  const honors = honorsLine(life);
  const moments = life.history.filter((h) => h.kind === "milestone" || h.kind === "draft" || h.kind === "move" || (h.kind === "injury" && h.tone === "bad")).slice(-10);
  const copy = async (value: string, done: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNote(done);
    } catch {
      setNote("Copy failed. Your browser blocked clipboard access.");
    }
  };
  const png = async () => {
    const facts = [
      life.achievements.nbaDebut !== null ? `NBA debut at ${Math.floor(life.achievements.nbaDebut / 12)}` : `Ended at ${Math.floor(life.ageMonths / 12)}`,
      life.achievements.drafted ? `Drafted: round ${life.achievements.drafted.round}, pick ${life.achievements.drafted.pick}` : "Undrafted",
      `${fmtHeight(life.body.heightCm, units)} · ${life.seasons.length} seasons`,
      ...(honors ? [honors] : []),
    ];
    const blob = await shareCardPng(life, { tier: TIER_LABEL[tier], born: `Born in ${born.name}`, route: route.slice(-4).join(" > "), facts, link });
    if (!blob) return setNote("Could not draw the card in this browser.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `one-shot-${life.identity.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNote("Card downloaded.");
  };
  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel className="p-5 sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--os-dim)]">End report</p>
        <div className="mt-3 flex items-start gap-4">
          <Portrait life={life} size={96} className="shrink-0 rounded-[6px] border border-[var(--os-border)]" />
          <div className="min-w-0">
            <h2 ref={heading} tabIndex={-1} className="text-[24px] font-semibold leading-tight focus:outline-none">
              {life.identity.displayName}
            </h2>
            <p className="mt-1 text-[13px] text-[var(--os-dim)]">
              {countryFlag(born.id)} Born in {life.birthplace.locality}, {born.name}
            </p>
            <p className="mt-2">
              <Chip tone={tier === "nba-debut" || tier === "nba-career" ? "green" : tier === "drafted" || tier === "top-pro" ? "teal" : "amber"}>{TIER_LABEL[tier]}</Chip>
            </p>
          </div>
        </div>
        <dl className="mt-4">
          <Kv k="NBA debut" v={life.achievements.nbaDebut !== null ? `Age ${Math.floor(life.achievements.nbaDebut / 12)}` : "No"} />
          <Kv k="Draft" v={life.achievements.drafted ? `Round ${life.achievements.drafted.round}, pick ${life.achievements.drafted.pick}` : "Undrafted"} />
          {life.nbaGames > 0 ? <Kv k="NBA games" v={life.nbaGames} mono /> : null}
          <Kv k="Height" v={fmtHeight(life.body.heightCm, units)} mono />
          <Kv k="Seasons played" v={life.seasons.length} mono />
          {best ? <Kv k="Best season" v={`${best.levelLabel}, age ${best.ageYears}: ${perGame(best, "pts").toFixed(1)} pts`} /> : null}
          {life.international.caps > 0 ? <Kv k="National team" v={`${life.international.caps} caps${medalLabel ? ` · ${medalLabel}` : ""}`} mono /> : null}
          {awards ? <Kv k="Season honors" v={awards} mono /> : null}
          <Kv k="Career earnings, pre-tax" v={life.earnings > 0 ? money(life.earnings) : "None"} mono />
          {life.earnings > 0 || life.finance.invested > 0 ? <Kv k="Net worth at the end" v={money(netWorth(life.finance))} mono /> : null}
          <Kv
            k="Life ended"
            v={
              life.ended?.reason === "chapter"
                ? "Chapter finished"
                : life.ended?.reason === "retired"
                  ? `Retired at ${Math.floor(life.ageMonths / 12)}`
                  : `Out of basketball at ${Math.floor(life.ageMonths / 12)}`
            }
          />
        </dl>
        {route.length ? <p className="mt-3 text-[12.5px] text-[var(--os-dim)]">Route: {route.join(" → ")}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Btn variant="primary" onClick={() => copy(text, "Result copied.")}>
            Copy result
          </Btn>
          <Btn onClick={png}>Download card</Btn>
          <Btn onClick={() => copy(link, "Replay link copied.")}>Copy replay link</Btn>
        </div>
        <p className="mt-2 min-h-[1.2em] text-[12px] text-[var(--os-green)]" role="status" aria-live="polite">
          {note}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--os-border)] pt-4">
          <Btn variant="primary" onClick={onNew}>
            New life
          </Btn>
          <Btn variant="quiet" onClick={onHome}>
            Back to start
          </Btn>
        </div>
      </Panel>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Key moments">
          <ol className="flex flex-col">
            {moments.map((h) => (
              <li key={h.id} className="grid grid-cols-[40px_1fr] gap-2 border-b border-[var(--os-border)]/50 py-1.5 text-[12.5px] last:border-b-0">
                <span className="font-mono text-[11px] text-[var(--os-dim)]">{Math.floor(h.month / 12)}</span>
                <span>{h.text}</span>
              </li>
            ))}
            {moments.length === 0 ? <li className="text-[12.5px] text-[var(--os-dim)]">A quiet life.</li> : null}
          </ol>
        </Panel>
        <Panel title="Seasons">
          <SeasonTable life={life} />
        </Panel>
        <Panel title="Same generation">
          <ul className="flex flex-col">
            {life.peers.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 border-b border-[var(--os-border)]/50 py-1.5 text-[12.5px] last:border-b-0">
                <span className="truncate">
                  {countryFlag(p.countryId)} {p.name}
                </span>
                <span className="shrink-0 text-[var(--os-dim)]">{p.status}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
