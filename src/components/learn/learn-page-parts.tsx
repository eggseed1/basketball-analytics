"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { ChoiceChip, ChoiceTrack } from "@/components/ui/choice-chip";
import { cn } from "@/lib/utils";

export function LearnHeader({
  title,
  lead,
  depth,
  onDepth,
  children,
}: {
  title: string;
  lead: string;
  depth: "plain" | "deep" | null;
  onDepth: (d: "plain" | "deep") => void;
  children?: ReactNode;
}) {
  const t = useTranslations("Learn");
  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-[2rem] font-bold tracking-tight sm:text-[2.25rem]">
        {title}
      </h1>
      <p className="max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
        {lead}
      </p>
      {children}
      {depth ? (
        <ChoiceTrack role="group" aria-label={t("depthAria")} className="w-fit">
          <DepthButton active={depth === "plain"} onClick={() => onDepth("plain")}>
            {t("depthPlain")}
          </DepthButton>
          <DepthButton active={depth === "deep"} onClick={() => onDepth("deep")}>
            {t("depthFull")}
          </DepthButton>
        </ChoiceTrack>
      ) : null}
    </header>
  );
}

function DepthButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <ChoiceChip active={active} onClick={onClick}>
      {children}
    </ChoiceChip>
  );
}

/** One card holding several titled bullet groups, so short pages don't become a stack of cards. */
export function LearnCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="sports-card flex flex-col gap-4 p-4 sm:p-5">
      {title ? <h2 className="text-[18px] font-bold">{title}</h2> : null}
      {children}
    </section>
  );
}

export function LearnBullets({
  title,
  items,
  ordered = false,
}: {
  title: string;
  items: string[] | undefined;
  ordered?: boolean;
}) {
  if (!items?.length) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <List
        className={cn(
          "mt-1.5 space-y-1.5 text-[14px] leading-relaxed text-muted-foreground",
          ordered ? "list-decimal pl-5" : "list-disc pl-5 marker:text-foreground/40"
        )}
      >
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </List>
    </div>
  );
}

export function LearnFormula({ children }: { children: ReactNode }) {
  const t = useTranslations("LearnPages");
  return (
    <div>
      <h3 className="text-[15px] font-semibold">{t("formula")}</h3>
      <div className="mt-1.5 whitespace-pre-wrap rounded-xl bg-secondary/80 px-3 py-2 font-mono text-[14px] leading-snug">
        {children}
      </div>
    </div>
  );
}
