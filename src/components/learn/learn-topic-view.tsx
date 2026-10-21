"use client";

import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";

import {
  LearnBullets,
  LearnCard,
  LearnFormula,
  LearnHeader,
} from "@/components/learn/learn-page-parts";
import type { LearnTopic } from "@/content/learn/topics";

export function LearnTopicView({
  topic,
  visual,
}: {
  topic: LearnTopic;
  /** Interactive explainer shown between the lead and the bullets. */
  visual?: ReactNode;
}) {
  const t = useTranslations("LearnPages");
  const [depth, setDepth] = useState<"plain" | "deep">("plain");
  const sources = topic.sources ?? [];
  const hasDeep =
    Boolean(topic.formula) ||
    Boolean(topic.calculation?.length) ||
    topic.caveats.length > 0 ||
    sources.length > 0;

  return (
    <div data-motion-stack className="flex flex-col gap-4">
      <LearnHeader
        title={topic.name}
        lead={topic.oneSentence}
        depth={hasDeep ? depth : null}
        onDepth={setDepth}
      />

      {visual}

      <LearnCard>
        <LearnBullets title={t("whyItMatters")} items={topic.whyItMatters} />
        <LearnBullets title={t("howToInterpret")} items={topic.howToInterpret} />
        <LearnBullets title={t("howDrblUses")} items={topic.howDrblUses} />
      </LearnCard>

      {depth === "deep" && hasDeep ? (
        <LearnCard title={t("fullDepth")}>
          {topic.formula ? <LearnFormula>{topic.formula}</LearnFormula> : null}
          <LearnBullets title={t("howCalculated")} items={topic.calculation} ordered />
          <LearnBullets title={t("caveats")} items={topic.caveats} />
          <LearnBullets title={t("sources")} items={sources} />
        </LearnCard>
      ) : null}
    </div>
  );
}
