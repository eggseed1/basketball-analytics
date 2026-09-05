"use client";

import { useState } from "react";

import type { LearnTopic } from "@/content/learn/topics";
import { relatedLearnLinks } from "@/content/learn/resolve";
import { AppLink } from "@/components/ui/app-link";
import { cn } from "@/lib/utils";

const TOPIC_CATEGORY_LABEL: Record<string, string> = {
  proprietary: "Proprietary stats",
  systems: "DRBL systems",
  status: "Labels & status",
  transactions: "Transactions",
  basics: "Basketball basics",
  shooting: "Shooting",
  usage: "Usage & role",
  team: "Team efficiency",
  impact: "Impact models",
};

export function LearnTopicView({ topic }: { topic: LearnTopic }) {
  const [depth, setDepth] = useState<"plain" | "deep">("plain");
  const related = relatedLearnLinks(topic.relatedIds);
  const hasDeep =
    Boolean(topic.formula) ||
    Boolean(topic.calculation?.length) ||
    Boolean(topic.sources?.length) ||
    topic.caveats.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {TOPIC_CATEGORY_LABEL[topic.category] ?? topic.category}
        </p>
        <h1 className="text-[2rem] font-bold tracking-tight sm:text-[2.25rem]">
          {topic.name}
        </h1>
        <p className="max-w-xl text-[16px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">In one sentence. </span>
          {topic.oneSentence}
        </p>
        {hasDeep ? (
          <div
            className="inline-flex w-fit rounded-full bg-secondary p-1"
            role="group"
            aria-label="Explanation depth"
          >
            <DepthButton
              active={depth === "plain"}
              onClick={() => setDepth("plain")}
            >
              Plain
            </DepthButton>
            <DepthButton
              active={depth === "deep"}
              onClick={() => setDepth("deep")}
            >
              Full depth
            </DepthButton>
          </div>
        ) : null}
      </header>

      <Section title="Why it matters" items={topic.whyItMatters} />
      <Section title="How to interpret it" items={topic.howToInterpret} />
      <Section title="How DRBL uses it" items={topic.howDrblUses} />

      {depth === "deep" && topic.formula ? (
        <section className="sports-card flex flex-col gap-3 p-4">
          <h2 className="text-[16px] font-bold">Definition & formula</h2>
          <div className="whitespace-pre-wrap rounded-xl bg-secondary/80 px-3 py-2 font-mono text-[14px] leading-snug">
            {topic.formula}
          </div>
        </section>
      ) : null}

      {depth === "deep" && topic.calculation?.length ? (
        <section className="sports-card flex flex-col gap-3 p-4">
          <h2 className="text-[16px] font-bold">How it is calculated</h2>
          <ol className="list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-muted-foreground">
            {topic.calculation.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {depth === "deep" ? (
        <Section title="Important caveats" items={topic.caveats} />
      ) : null}

      {related.length ? (
        <section>
          <h2 className="mb-2 text-[16px] font-bold">Related concepts</h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <AppLink
                key={r.href}
                href={r.href}
                className="rounded-full bg-secondary px-3 py-1.5 text-[14px] font-semibold"
              >
                {r.label}
              </AppLink>
            ))}
          </div>
        </section>
      ) : null}

      {topic.seeInAction.length ? (
        <section>
          <h2 className="mb-2 text-[16px] font-bold">See it in DRBL</h2>
          <ul className="flex flex-col gap-1.5">
            {topic.seeInAction.map((a) => (
              <li key={a.href}>
                <AppLink
                  href={a.href}
                  className="text-[14px] font-semibold underline-offset-2 hover:underline"
                >
                  {a.label} →
                </AppLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {depth === "deep" && topic.sources?.length ? (
        <section className="pb-2">
          <h2 className="mb-2 text-[14px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Sources
          </h2>
          <ul className="space-y-1 text-[12px] text-muted-foreground">
            {topic.sources.map((s) => (
              <li key={s}>· {s}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function DepthButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="sports-card p-4">
      <h2 className="text-[16px] font-bold">{title}</h2>
      <ul className="mt-2 space-y-2 text-[14px] leading-relaxed text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/40" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
