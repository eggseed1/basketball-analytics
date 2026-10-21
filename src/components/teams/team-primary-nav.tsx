"use client";

import { useTranslations } from "next-intl";

import { TransitionLink } from "@/components/continuity/query-nav";
import { type } from "@/lib/design-system";
import {
  TEAM_PAGE_TABS,
  teamPageHref,
  type TeamPageHrefOpts,
  type TeamPageTab,
} from "@/lib/team-destination";
import { cn } from "@/lib/utils";

const TAB_KEYS: Record<TeamPageTab, string> = {
  overview: "tabOverview",
  players: "tabPlayers",
  offense: "tabOffenseDefense",
  onoff: "tabOnOff",
  games: "tabGames",
  splits: "tabSplits",
  playoffs: "tabPlayoffs",
  organization: "tabOrganization",
  sentiment: "tabSentiment",
  payroll: "tabPayroll",
  stats: "tabAllStats",
};

export function TeamPrimaryNav({
  teamId,
  tab,
  hrefOpts,
}: {
  teamId: string;
  tab: TeamPageTab;
  hrefOpts: Omit<TeamPageHrefOpts, "tab">;
}) {
  const t = useTranslations("TeamDetail");

  return (
    <div
      role="tablist"
      aria-label={t("tabsAria")}
      data-motion-tabs="stats"
      className="flex flex-nowrap items-end gap-x-2 overflow-x-auto border-b-[0.5px] border-foreground/20 px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TEAM_PAGE_TABS.map((item) => {
        const selected = item.id === tab;
        return (
          <TransitionLink
            key={item.id}
            role="tab"
            aria-selected={selected}
            href={teamPageHref(teamId, { ...hrefOpts, tab: item.id })}
            scroll={false}
            className={cn(
              type.bodySm,
              "shrink-0 whitespace-nowrap px-2 py-2 font-bold tracking-tight",
              selected
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t(TAB_KEYS[item.id])}
          </TransitionLink>
        );
      })}
    </div>
  );
}
