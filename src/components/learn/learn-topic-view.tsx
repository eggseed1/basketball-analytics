"use client";

import { type ReactNode, useState } from "react";

import {
  LearnBullets,
  LearnCard,
  LearnFormula,
  LearnHeader,
} from "@/components/learn/learn-page-parts";
import type { LearnTopic } from "@/content/learn/topics";

export function LearnTopicView({
  topic,
  eyebrow,
  visual,
}: {
  topic: LearnTopic;
  eyebrow: string;
  /** Interactive explainer shown between the lead and the bullets. */
  visual?: ReactNode;
}) {
  const [depth, setDepth] = useState<"plain" | "deep">("plain");
  const sources = topic.sources ?? [];
  const hasDeep =
    Boolean(topic.formula) ||
    Boolean(topic.calculation?.length) ||
    topic.caveats.length > 0 ||
    sources.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <LearnHeader
        eyebrow={eyebrow}
        title={topic.name}
        lead={topic.oneSentence}
        depth={hasDeep ? depth : null}
        onDepth={setDepth}
      />

      {visual}

      <LearnCard>
        <LearnBullets title="Why it matters" items={topic.whyItMatters} />
        <LearnBullets title="How to interpret it" items={topic.howToInterpret} />
        <LearnBullets title="How DRBL uses it" items={topic.howDrblUses} />
      </LearnCard>

      {depth === "deep" && hasDeep ? (
        <LearnCard title="Full depth">
          {topic.formula ? <LearnFormula>{topic.formula}</LearnFormula> : null}
          <LearnBullets title="How it's calculated" items={topic.calculation} ordered />
          <LearnBullets title="Caveats" items={topic.caveats} />
          <LearnBullets title="Sources" items={sources} />
        </LearnCard>
      ) : null}
    </div>
  );
}
