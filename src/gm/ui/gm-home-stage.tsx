"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { GmAwardsShow } from "@/gm/ui/gm-awards-show";
import { GmChampionSplash } from "@/gm/ui/gm-champion-splash";
import { GmGamePlan } from "@/gm/ui/gm-game-plan";
import { GmPlayInSchedule } from "@/gm/ui/gm-play-in";
import { GmPlayoffBracket } from "@/gm/ui/gm-playoff-bracket";
import { GmSeasonCalendar } from "@/gm/ui/gm-season-calendar";
import { FranchiseSummary } from "@/gm/ui/gm-franchise-desk";
import { OffseasonHub } from "@/gm/ui/offseason-hub";
import { homeStageLabel, resolveHomeStage } from "@/gm/lib/home-stage";
import { userCap, userRecord } from "@/gm/lib/selectors";
import { useGmStore } from "@/gm/state/gm-store";
import { formatNumber } from "@/lib/format";
import type { GmLeagueState } from "@/gm/types";

function CapStrip({ league }: { league: GmLeagueState }) {
  const t = useTranslations("GmUi");
  const record = userRecord(league);
  const cap = userCap(league);
  return (
    <section className="grid gap-3 sm:grid-cols-2">
      <div className="sports-card p-4">
        <p className="text-[14px] font-semibold text-muted-foreground">{t("homeCapRoom")}</p>
        <p className="score-num mt-1 text-[2.5rem]">${formatNumber(cap.capRoomM, 1)}M</p>
        <p className="text-[14px] text-muted-foreground">
          {t("homeOnYear", { wins: record?.wins ?? 0, losses: record?.losses ?? 0 })}
          {cap.overSecondApron
            ? t("homeSecondApron")
            : cap.overFirstApron
              ? t("homeFirstApron")
              : cap.overTax
                ? t("homeTax")
                : ""}
        </p>
      </div>
      <div className="sports-card p-4">
        <p className="text-[14px] font-semibold text-muted-foreground">{t("homePayroll")}</p>
        <p className="score-num mt-1 text-[2.5rem]">${formatNumber(cap.payrollM, 1)}M</p>
        <p className="text-[14px] text-muted-foreground">
          {t("homeCapLine", { cap: formatNumber(league.settings.salaryCapM, 1) })}
          {cap.overTax ? t("homeTax") : ""}
        </p>
      </div>
    </section>
  );
}

function Briefings({ league }: { league: GmLeagueState }) {
  const t = useTranslations("GmUi");
  const news = league.news.slice(0, 5);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[16px] font-bold">{t("homeBriefings")}</h2>
      <ul className="sports-card divide-y divide-black/5">
        {news.length === 0 ? (
          <li className="px-4 py-3 text-[14px] text-muted-foreground">{t("homeNoNews")}</li>
        ) : (
          news.map((item) => (
            <li
              key={item.id}
              className="border-l-4 px-4 py-3"
              style={{
                borderLeftColor:
                  item.tone === "good"
                    ? "#5ee0a0"
                    : item.tone === "bad"
                      ? "#ff6b6b"
                      : item.tone === "trade"
                        ? "#8eb6ff"
                        : "var(--team-primary)",
              }}
            >
              <p className="font-semibold">{item.headline}</p>
              <p className="text-[14px] text-muted-foreground">{item.body}</p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function StageChip({ league }: { league: GmLeagueState }) {
  const stage = resolveHomeStage(league);
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {homeStageLabel(stage)}
    </p>
  );
}

function QuickLinks() {
  const t = useTranslations("GmUi");
  return (
    <p className="text-[14px] text-muted-foreground">
      <Link className="font-semibold text-foreground underline-offset-4 hover:underline" href="/gm/offseason">
        {t("homeOffseasonHub")}
      </Link>
      {" · "}
      <Link className="underline-offset-4 hover:underline" href="/gm/trade">
        {t("homeTrade")}
      </Link>
      {" · "}
      <Link className="underline-offset-4 hover:underline" href="/gm/cap">
        {t("homeCap")}
      </Link>
      {" · "}
      <Link className="underline-offset-4 hover:underline" href="/gm/awards">
        {t("homeAwards")}
      </Link>
      {" · "}
      <Link className="underline-offset-4 hover:underline" href="/gm/standings">
        {t("homeStandings")}
      </Link>
    </p>
  );
}

/**
 * Home content keyed off season stage so each stretch of the year feels distinct.
 */
export function GmHomeStage({ league }: { league: GmLeagueState }) {
  const t = useTranslations("GmUi");
  const ackAwards = useGmStore((state) => state.ackAwardsShow);
  const ackChampion = useGmStore((state) => state.ackChampionSplash);
  const stage = resolveHomeStage(league);

  if (stage === "awards") {
    return (
      <div className="flex flex-col gap-4">
        <StageChip league={league} />
        <GmAwardsShow league={league} onContinue={() => ackAwards()} />
      </div>
    );
  }

  if (stage === "champion") {
    return (
      <div className="flex flex-col gap-4">
        <StageChip league={league} />
        <GmChampionSplash league={league} onContinue={() => ackChampion()} />
      </div>
    );
  }

  if (stage === "play_in") {
    return (
      <div className="flex flex-col gap-4">
        <StageChip league={league} />
        <header>
          <h1 className="text-[28px] font-bold tracking-tight">{t("pagePlayInTitle")}</h1>
          <p className="text-[15px] text-muted-foreground">{t("pagePlayInBlurb")}</p>
        </header>
        <GmPlayInSchedule league={league} />
        <GmGamePlan league={league} />
        <Briefings league={league} />
      </div>
    );
  }

  if (stage === "playoffs") {
    return (
      <div className="flex flex-col gap-4">
        <StageChip league={league} />
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight">{t("pagePlayoffsTitle")}</h1>
            <p className="text-[15px] text-muted-foreground">{t("homePlayoffsBlurb")}</p>
          </div>
        </header>
        <GmPlayoffBracket league={league} controls />
        <GmGamePlan league={league} />
        <Briefings league={league} />
      </div>
    );
  }

  if (stage === "draft" || stage === "free_agency" || stage === "offseason") {
    return (
      <div className="flex flex-col gap-4">
        <StageChip league={league} />
        <header>
          <h1 className="text-[28px] font-bold tracking-tight">{t("pageOffseasonTitle")}</h1>
          <p className="text-[15px] text-muted-foreground">{t("homeSummerBlurb")}</p>
        </header>
        <OffseasonHub embedded />
      </div>
    );
  }

  // Regular season — calendar command center.
  return (
    <div className="flex flex-col gap-4">
      <StageChip league={league} />
      <GmSeasonCalendar league={league} />
      <CapStrip league={league} />
      <GmGamePlan league={league} />
      <FranchiseSummary league={league} />
      <QuickLinks />
      <Briefings league={league} />
    </div>
  );
}

