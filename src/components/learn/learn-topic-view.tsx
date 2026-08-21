import type { LearnTopic } from "@/content/learn/topics";
import { relatedLearnLinks } from "@/content/learn/resolve";
import { AppLink } from "@/components/ui/app-link";

export function LearnTopicView({ topic }: { topic: LearnTopic }) {
  const related = relatedLearnLinks(topic.relatedIds);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {topic.category}
        </p>
        <h1 className="text-[2rem] font-bold tracking-tight sm:text-[2.25rem]">
          {topic.name}
        </h1>
        <p className="max-w-xl text-[16px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">In one sentence. </span>
          {topic.oneSentence}
        </p>
      </header>

      <Section title="Why it matters" items={topic.whyItMatters} />
      <Section title="How to interpret it" items={topic.howToInterpret} />
      <Section title="How DRBL uses it" items={topic.howDrblUses} />

      {topic.formula || topic.calculation?.length ? (
        <section className="sports-card flex flex-col gap-3 p-4">
          <h2 className="text-[16px] font-bold">How it is calculated</h2>
          {topic.formula ? (
            <div className="whitespace-pre-wrap rounded-xl bg-secondary/80 px-3 py-2 font-mono text-[14px] leading-snug">
              {topic.formula}
            </div>
          ) : null}
          {topic.calculation?.length ? (
            <ol className="list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-muted-foreground">
              {topic.calculation.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      <Section title="Important caveats" items={topic.caveats} />

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

      {topic.sources?.length ? (
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

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-[16px] font-bold">{title}</h2>
      <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
