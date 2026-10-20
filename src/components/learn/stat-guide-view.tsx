"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

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
  visual,
}: {
  guide: StatGuide;
  visual?: ReactNode;
}) {
  const t = useTranslations("LearnPages");
  const [depth, setDepth] = useState<"plain" | "deep">("plain");
  const body = depth === "plain" ? guide.plain : guide.deep;
  const showCustomEquations =
    guide.slug === "drbl-100" || guide.slug === "war1";

  return (
    <div data-motion-stack className="flex flex-col gap-6">
      <LearnHeader
        title={guide.name}
        lead={guide.blurb}
        depth={depth}
        onDepth={setDepth}
      >
        {guide.slug === "war1" ? (
          <aside className="max-w-2xl rounded-md border border-border/70 frost-surface-soft px-3 py-2.5 text-[14px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">{t("war1ZeroLabel")} </span>
            {t("war1ZeroBody")}
          </aside>
        ) : null}
      </LearnHeader>

      {visual}

      {depth === "deep" ? (
        <LearnCard title={t("definitionAndFormula")}>
          <div>
            <h3 className="text-[15px] font-semibold">{t("definition")}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
              {guide.deep.definition}
            </p>
          </div>
          {showCustomEquations ? (
            <div>
              <h3 className="text-[15px] font-semibold">{t("formula")}</h3>
              <div className="mt-1.5">
                <GuideFormulaEquations slug={guide.slug} />
              </div>
            </div>
          ) : (
            <LearnFormula>{guide.deep.formula}</LearnFormula>
          )}
          <LearnBullets title={t("howCalculated")} items={guide.deep.calculation} ordered />
        </LearnCard>
      ) : null}

      <LearnCard>
        <LearnBullets title={t("whatItTeaches")} items={body.teaches} />
        <LearnBullets title={t("whatItDoesnt")} items={body.doesnt} />
        <LearnBullets title={t("upsides")} items={body.upsides} />
        <LearnBullets title={t("downsides")} items={body.downsides} />
        <LearnBullets title={t("howToApply")} items={body.apply} />
      </LearnCard>

      {depth === "deep" && guide.deep.sources?.length ? (
        <LearnCard>
          <LearnBullets title={t("sourcesLineage")} items={guide.deep.sources} />
        </LearnCard>
      ) : null}
    </div>
  );
}
