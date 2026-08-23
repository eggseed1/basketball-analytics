"use client";

import { useState } from "react";

import type { StatGuide } from "@/content/stats/guides";
import { cn } from "@/lib/utils";

const GUIDE_CATEGORY_LABEL: Record<StatGuide["category"], string> = {
  proprietary: "Proprietary stats",
  impact: "Impact models",
  efficiency: "Efficiency",
  possession: "Possessions",
  team: "Team",
};

export function StatGuideView({ guide }: { guide: StatGuide }) {
  const [depth, setDepth] = useState<"plain" | "deep">("plain");
  const body = depth === "plain" ? guide.plain : guide.deep;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {GUIDE_CATEGORY_LABEL[guide.category] ?? guide.category}
        </p>
        <h1 className="text-[2rem] font-bold tracking-tight sm:text-[2.25rem]">
          {guide.name}
        </h1>
        <p className="max-w-xl text-[16px] leading-relaxed text-muted-foreground">
          {guide.blurb}
        </p>
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
      </header>

      {depth === "deep" ? (
        <section className="sports-card flex flex-col gap-3 p-4">
          <h2 className="text-[16px] font-bold">Definition</h2>
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            {guide.deep.definition}
          </p>
          <div className="rounded-xl bg-secondary/80 px-3 py-2 font-mono text-[14px] leading-snug">
            {guide.deep.formula}
          </div>
          <h3 className="text-[14px] font-semibold">Calculation</h3>
          <ol className="list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-muted-foreground">
            {guide.deep.calculation.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      <Section title="What it teaches" items={body.teaches} />
      <Section title="What it doesn’t" items={body.doesnt} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Section title="Upsides" items={body.upsides} />
        <Section title="Downsides" items={body.downsides} />
      </div>
      <Section title="How to apply it" items={body.apply} />

      {depth === "deep" && guide.deep.sources?.length ? (
        <section className="pb-4">
          <h2 className="mb-2 text-[16px] font-bold">Sources & lineage</h2>
          <ul className="space-y-1 text-[14px] text-muted-foreground">
            {guide.deep.sources.map((s) => (
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
