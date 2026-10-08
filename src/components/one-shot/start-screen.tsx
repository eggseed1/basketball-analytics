"use client";

import { TIER_LABEL, type CareerSummary } from "@/one-shot/report";
import type { DrawMode, Mode, Pacing } from "@/one-shot/types";
import { country, countryFlag, PLAYABLE_COUNTRIES } from "@/one-shot/world";

import { Btn, Panel, Segmented } from "./ui";

export interface StartOptions {
  mode: Mode;
  draw: DrawMode;
  pacing: Pacing;
}

export function StartScreen({
  opts,
  onOpts,
  onBorn,
  canContinue,
  continueLabel,
  onContinue,
  careers,
  replaySeed,
  onClearReplay,
  recovery,
  onDownloadBad,
  onDiscardBad,
  daily,
  onSources,
}: {
  opts: StartOptions;
  onOpts: (o: StartOptions) => void;
  onBorn: () => void;
  canContinue: boolean;
  continueLabel: string | null;
  onContinue: () => void;
  careers: CareerSummary[];
  replaySeed: number | null;
  onClearReplay: () => void;
  recovery: string | null;
  onDownloadBad: () => void;
  onDiscardBad: () => void;
  daily: string;
  onSources: () => void;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel className="p-5 sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--os-dim)]">DRBL Arcade · life sim</p>
        <h2 className="mt-2 font-mono text-[44px] font-bold leading-none tracking-[0.04em] sm:text-[56px]">ONE SHOT</h2>
        <p className="mt-3 text-[16px] text-[var(--os-text)]/90">One life. A world of paths. Make the league.</p>
        <p className="mt-3 max-w-[56ch] text-[13px] text-[var(--os-dim)]">
          You are born somewhere in the world with a body, a family and a hometown you didn&apos;t choose. Set his focus each year, take or turn down
          offers, and try to play one NBA regular-season game.
        </p>

        {recovery ? (
          <div role="alert" className="mt-5 rounded-lg border border-[var(--os-rose)]/60 p-3 text-[13px]">
            <p className="font-medium text-[var(--os-rose)]">Your saved life could not be loaded.</p>
            <p className="mt-1 text-[var(--os-dim)]">{recovery}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Btn onClick={onDownloadBad}>Download the save file</Btn>
              <Btn onClick={onDiscardBad}>Discard it</Btn>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-4">
          <Field label="Mode" hint={opts.mode === "daily" ? `Everyone gets the same birth today (${daily}, UTC). It changes at 00:00 UTC.` : "A new random birth each time."}>
            <Segmented<Mode>
              label="Mode"
              value={opts.mode}
              onChange={(mode) => onOpts({ ...opts, mode })}
              options={[
                { value: "random", label: "Random" },
                { value: "daily", label: "Daily" },
              ]}
            />
          </Field>
          <Field
            label="Where you can be born"
            hint={
              opts.mode === "daily"
                ? "The daily life always uses real birth numbers."
                : opts.draw === "weighted"
                  ? "Weighted by real births per year, so India and Nigeria come up far more often than Iceland."
                  : `Every one of ${PLAYABLE_COUNTRIES.length} inhabited places has the same chance.`
            }
          >
            <Segmented<DrawMode>
              label="Birth draw"
              value={opts.mode === "daily" ? "weighted" : opts.draw}
              onChange={(draw) => onOpts({ ...opts, draw })}
              options={[
                { value: "weighted", label: "By real births" },
                { value: "equal", label: "Equal odds", disabled: opts.mode === "daily" },
              ]}
            />
          </Field>
          <Field
            label="Pacing"
            hint={
              opts.mode === "daily"
                ? "The daily life uses standard pacing."
                : { short: "Fewer events. About 5 to 8 minutes.", standard: "About 8 to 15 minutes to an NBA debut or the end of the road.", extended: "More events and more time between them. About 15 to 25 minutes." }[opts.pacing]
            }
          >
            <Segmented<Pacing>
              label="Pacing"
              value={opts.mode === "daily" ? "standard" : opts.pacing}
              onChange={(pacing) => onOpts({ ...opts, pacing })}
              options={[
                { value: "short", label: "Short", disabled: opts.mode === "daily" },
                { value: "standard", label: "Standard" },
                { value: "extended", label: "Extended", disabled: opts.mode === "daily" },
              ]}
            />
          </Field>
        </div>

        {replaySeed !== null && opts.mode === "random" ? (
          <p className="mt-4 text-[12.5px] text-[var(--os-dim)]">
            Replaying seed <span className="font-mono text-[var(--os-text)]">{replaySeed}</span>.{" "}
            <button type="button" className="underline hover:text-[var(--os-text)]" onClick={onClearReplay}>
              Use a random seed instead
            </button>
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Btn variant="primary" className="min-h-11 px-6 text-[15px]" onClick={onBorn}>
            Be born
          </Btn>
          {canContinue ? (
            <Btn className="min-h-11 px-5" onClick={onContinue}>
              Continue life{continueLabel ? ` · ${continueLabel}` : ""}
            </Btn>
          ) : null}
          <Btn variant="quiet" className="min-h-11" onClick={onSources}>
            Sources and coverage
          </Btn>
        </div>
        <p className="mt-4 text-[11.5px] text-[var(--os-dim)]">Fiction. Real leagues and federations appear as context; every player, offer and result is invented.</p>
      </Panel>

      <Panel title="Recent careers">
        {careers.length ? (
          <ol className="flex flex-col">
            {careers.map((c) => {
              const ct = country(c.birthCountry);
              return (
                <li key={c.runId} className="border-b border-[var(--os-border)]/60 py-2 text-[12.5px] last:border-b-0">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">
                      {countryFlag(ct.id)} {c.name}
                      {c.unicorn ? <span title="Unicorn seed"> 🦄</span> : null}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-[var(--os-dim)]">{c.mode === "daily" ? `Daily ${c.dailyDate}` : `Seed ${c.seed}`}</span>
                  </p>
                  <p className="text-[var(--os-dim)]">
                    {TIER_LABEL[c.tier]}
                    {c.debutAge !== null ? ` at ${c.debutAge}` : ""} · {ct.name}
                    {c.draft ? ` · ${c.draft}` : ""}
                  </p>
                  {c.peak ? <p className="text-[11.5px] text-[var(--os-dim)]">Best season: {c.peak}</p> : null}
                  {c.after ? <p className="text-[11.5px] text-[var(--os-dim)]">After playing: {c.after}</p> : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-[12.5px] text-[var(--os-dim)]">Finished lives show up here. The last 15 are kept on this device.</p>
        )}
      </Panel>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[var(--os-dim)]">{label}</span>
      {children}
      <span className="text-[11.5px] text-[var(--os-dim)]">{hint}</span>
    </div>
  );
}
