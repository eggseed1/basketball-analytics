"use client";

import { useState, type ReactNode } from "react";

import { GuideFormulaEquations } from "@/components/learn/drbl-math-formulas";
import {
  LearnBullets,
  LearnCard,
  LearnFormula,
  LearnHeader,
} from "@/components/learn/learn-page-parts";
import type { StatGuide } from "@/content/stats/guides";

export function StatGuideView({
  guide,
  eyebrow,
  visual,
}: {
  guide: StatGuide;
  eyebrow: string;
  visual?: ReactNode;
}) {
  const [depth, setDepth] = useState<"plain" | "deep">("plain");
  const body = depth === "plain" ? guide.plain : guide.deep;
  const showCustomEquations =
    guide.slug === "drbl-100" || guide.slug === "war1";

  return (
    <div className="flex flex-col gap-6">
      <LearnHeader
        eyebrow={eyebrow}
        title={guide.name}
        lead={guide.blurb}
        depth={depth}
        onDepth={setDepth}
      >
        {guide.slug === "war1" ? (
          <aside className="max-w-2xl rounded-md border border-border/70 frost-surface-soft px-3 py-2.5 text-[14px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Where zero sits: </span>
            a roster whose players add up to about 0 WAR1 plays like a team that
            wins roughly 35 to 38 games, not a 20-win replacement-level team.
            That comes from how the R1 baseline is set. Team WAR1 totals are not
            a prediction of standings wins.
          </aside>
        ) : null}
      </LearnHeader>

      {visual}

      {depth === "deep" ? (
        <LearnCard title="Definition and formula">
          <div>
            <h3 className="text-[15px] font-semibold">Definition</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
              {guide.deep.definition}
            </p>
          </div>
          {showCustomEquations ? (
            <div>
              <h3 className="text-[15px] font-semibold">Formula</h3>
              <div className="mt-1.5">
                <GuideFormulaEquations slug={guide.slug} />
              </div>
            </div>
          ) : (
            <LearnFormula>{guide.deep.formula}</LearnFormula>
          )}
          <LearnBullets title="How it's calculated" items={guide.deep.calculation} ordered />
        </LearnCard>
      ) : null}

      <LearnCard>
        <LearnBullets title="What it teaches" items={body.teaches} />
        <LearnBullets title="What it doesn't" items={body.doesnt} />
        <LearnBullets title="Upsides" items={body.upsides} />
        <LearnBullets title="Downsides" items={body.downsides} />
        <LearnBullets title="How to apply it" items={body.apply} />
      </LearnCard>

      {depth === "deep" && guide.deep.sources?.length ? (
        <LearnCard>
          <LearnBullets title="Sources & lineage" items={guide.deep.sources} />
        </LearnCard>
      ) : null}
    </div>
  );
}
