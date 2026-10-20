import { getTranslations } from "next-intl/server";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import { TradeSimulator } from "@/components/trade/trade-simulator";
import { PageHeader } from "@/components/layout/page-header";
import { loadTradeSimulatorBoard } from "@/data/queries/trade-simulator";

export const metadata = {
  alternates: { canonical: "/explore/teams/trade" },
  title: "NBA trade simulator",
  description:
    "Build two-team swaps with CBA salary-matching package suggestions and DRBL impact. This is a salary-fit sketch, not a full legality ruling.",
};

export default async function TradeSimulatorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("Explore");
  const params = await searchParams;
  const board = loadTradeSimulatorBoard();
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const list = (key: string) =>
    (one(key) ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title={t("tradeTitle")}
        subtitle={t("tradeSubtitle", {
          seasonPrefix:
            board && board.statsSeason !== board.season
              ? t("tradeSubtitleSeason", { season: board.statsSeason })
              : "",
        })}
      />
      {board ? (
        <TradeSimulator
          board={board}
          initialA={one("a")}
          initialB={one("b")}
          initialGive={list("give")}
          initialGet={list("get")}
        />
      ) : (
        <p className="text-[14px] text-muted-foreground">
          {t("tradeEmpty")}
        </p>
      )}
    </main>
  );
}
