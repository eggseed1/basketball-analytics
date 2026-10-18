"use client";

import { FormEvent, Fragment, ReactNode, useRef, useState } from "react";

import type { AskAgentEvent } from "@/ask-agent/agent";
import { askChipClassName, askSubmitClassName, askTextareaClassName } from "@/components/ask/ask-field";
import { AppLink } from "@/components/ui/app-link";
import { cn } from "@/lib/utils";

type Step = { id: string; label: string; done: boolean; ok?: boolean; summary?: string; sql?: string };

type Exchange = {
  question: string;
  steps: Step[];
  answer?: Extract<AskAgentEvent, { type: "answer" }>;
  error?: string;
  usage?: Extract<AskAgentEvent, { type: "usage" }>;
  pending: boolean;
};

const EXAMPLES = [
  "Who had the best true shooting among 20-point scorers in 2024-25?",
  "Which team has the most guaranteed salary for 2026-27?",
  "Top 5 players by DARKO in 2025-26, with their DRBL ratings",
];

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const [, bold, label, href] = match;
    if (bold) out.push(<strong key={match.index}>{bold}</strong>);
    else if (href?.startsWith("/") && !href.startsWith("//"))
      out.push(
        <AppLink key={match.index} href={href} className="font-semibold underline underline-offset-2">
          {label}
        </AppLink>
      );
    else out.push(label);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Paragraphs, "- " lists, **bold** and site-internal links. Nothing else is rendered as markup. */
function AnswerText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2 text-[15px] leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length && lines.every((l) => /^[-*•]\s/.test(l)))
          return (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function StepTrace({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <ol className="flex flex-col gap-1.5 text-[13px]">
      {steps.map((step) => (
        <li key={step.id} className="flex flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span
              aria-hidden
              className={cn(
                "inline-block size-2 shrink-0 rounded-full",
                !step.done ? "animate-pulse bg-muted-foreground" : step.ok ? "bg-[#1D428A]" : "bg-[#C8102E]"
              )}
            />
            <span className="font-semibold">{step.label}</span>
            {step.summary ? <span className="text-muted-foreground">{step.summary}</span> : null}
          </span>
          {step.sql ? (
            <details className="ml-4">
              <summary className="cursor-pointer text-[12px] font-semibold text-muted-foreground">Query</summary>
              <pre className="mt-1 overflow-x-auto rounded-md bg-secondary/50 px-3 py-2 text-[12px] leading-snug">
                {step.sql}
              </pre>
            </details>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function GroundingNote({ grounding }: { grounding: Extract<AskAgentEvent, { type: "answer" }>["grounding"] }) {
  if (!grounding.checked) return null;
  const missing = grounding.unmatched.length;
  return (
    <p className={cn("text-[12px] font-semibold", missing ? "text-[#C8102E]" : "text-muted-foreground")}>
      {missing
        ? `${missing} of ${grounding.checked} figures weren't found in the data it pulled: ${grounding.unmatched.join(", ")}. Treat them with care.`
        : `All ${grounding.checked} figures match the data it pulled.`}
    </p>
  );
}

function ExchangeCard({ exchange }: { exchange: Exchange }) {
  const { answer } = exchange;
  return (
    <article className="sports-card flex flex-col gap-3 px-4 py-4 sm:px-5">
      <p className="text-[15px] font-bold tracking-tight">{exchange.question}</p>
      <StepTrace steps={exchange.steps} />
      {exchange.pending && !exchange.steps.length ? (
        <p className="animate-pulse text-[13px] text-muted-foreground">Thinking…</p>
      ) : null}
      {answer ? (
        <>
          <AnswerText text={answer.text} />
          {answer.links.length ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              {answer.links.map((link) => (
                <li key={link.href}>
                  <AppLink href={link.href} className="font-semibold underline-offset-2 hover:underline">
                    {link.label}
                  </AppLink>
                </li>
              ))}
            </ul>
          ) : null}
          <GroundingNote grounding={answer.grounding} />
        </>
      ) : null}
      {exchange.error ? <p className="text-[14px] font-semibold text-[#C8102E]">{exchange.error}</p> : null}
      {exchange.usage ? (
        <p className="text-[11px] text-muted-foreground">
          {Math.round(exchange.usage.neurons)} neurons for this answer · {exchange.usage.usedToday.toLocaleString()} of{" "}
          {exchange.usage.cap.toLocaleString()} free neurons used today
        </p>
      ) : null}
    </article>
  );
}

function applyEvent(exchange: Exchange, event: AskAgentEvent): Exchange {
  switch (event.type) {
    case "step":
      return { ...exchange, steps: [...exchange.steps, { id: event.id, label: event.label, done: false }] };
    case "step_done":
      return {
        ...exchange,
        steps: exchange.steps.map((s) =>
          s.id === event.id ? { ...s, done: true, ok: event.ok, summary: event.summary, sql: event.sql } : s
        ),
      };
    case "answer":
      return { ...exchange, answer: event };
    case "usage":
      return { ...exchange, usage: event };
    case "error":
      return { ...exchange, error: event.message };
  }
}

export function AskAgentChat() {
  const [value, setValue] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const busy = useRef(false);
  const pending = exchanges.at(-1)?.pending ?? false;

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy.current) return;
    busy.current = true;
    const history = exchanges.flatMap((e) =>
      e.answer
        ? [
            { role: "user" as const, content: e.question },
            { role: "assistant" as const, content: e.answer.text },
          ]
        : []
    );
    setValue("");
    setExchanges((prev) => [...prev, { question: q, steps: [], pending: true }]);
    const update = (fn: (e: Exchange) => Exchange) =>
      setExchanges((prev) => prev.map((e, i) => (i === prev.length - 1 ? fn(e) : e)));

    try {
      const res = await fetch("/api/ask/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      if (!res.ok || !res.body) throw new Error(res.status === 429 ? "Too many requests. Wait a minute." : "Ask DRBL couldn't answer that.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value: chunk } = await reader.read();
        buffer += decoder.decode(chunk, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AskAgentEvent;
          update((e) => applyEvent(e, event));
        }
        if (done) break;
      }
    } catch (error) {
      update((e) => ({ ...e, error: error instanceof Error ? error.message : "Something went wrong." }));
    } finally {
      update((e) => ({ ...e, pending: false }));
      busy.current = false;
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(value);
  }

  return (
    <section className="flex flex-col gap-4 border-b border-border pb-8" aria-label="Ask DRBL chat preview">
      <header className="flex flex-col gap-1">
        <h2 className="text-[20px] font-bold tracking-tight">
          Chat <span className="text-[13px] font-semibold text-muted-foreground">preview, internal only</span>
        </h2>
        <p className="max-w-2xl text-[14px] text-muted-foreground">
          Ask in plain English. It queries the DRBL database, shows each step, and checks every figure in the answer
          against what it pulled. It can still misread a question, so open the queries when something looks off.
        </p>
      </header>

      {exchanges.map((exchange, i) => (
        <ExchangeCard key={i} exchange={exchange} />
      ))}

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label className="sr-only" htmlFor="ask-agent-input">
          Ask the DRBL chat
        </label>
        <textarea
          id="ask-agent-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(value);
            }
          }}
          rows={2}
          maxLength={500}
          placeholder={exchanges.length ? "Ask a follow-up…" : "Ask anything about players, teams, contracts or awards…"}
          className={askTextareaClassName}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending || !value.trim()}
            className={askSubmitClassName}
          >
            {pending ? "Working…" : "Ask"}
          </button>
          {exchanges.length ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setExchanges([])}
              className="text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              New chat
            </button>
          ) : null}
        </div>
        {exchanges.length ? null : (
          <div className="flex flex-wrap items-center gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => void ask(example)}
                className={askChipClassName}
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </form>
    </section>
  );
}
