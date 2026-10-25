import { getTranslations } from "next-intl/server";

import { MotionReveal } from "@/components/continuity/motion-reveal";
import { PlayerStylesBoard } from "@/components/explore/player-styles-board";
import { PageHeader } from "@/components/layout/page-header";
import { SegmentedLinks } from "@/components/ui/segmented-links";
import {
  getAvailableSeasons,
  listExploreBoardReadySeasons,
} from "@/data/queries";
import { defaultExploreConcretePlayersSeason } from "@/lib/player-board-season";
import {
  isAssignedPlayerRoleId,
  PLAYER_ROLE_CATALOG,
} from "@/lib/player-role";
import { getPlayerStylesDirectory } from "@/lib/player-styles-board";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export const metadata = {
  alternates: { canonical: "/explore/players/styles" },
  title: "NBA player styles and archetypes",
  description:
    "DRBL groups NBA players by style: engines, volume scorers, spacers, finishers, and big archetypes from usage, creation, and shot diet.",
};

const BASE = "/explore/players/styles";

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlayerStylesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("Explore");
  const params = await searchParams;
  const [seasons, boardReadySeasons] = await Promise.all([
    getAvailableSeasons(),
    listExploreBoardReadySeasons(),
  ]);
  const defaultSeason = defaultExploreConcretePlayersSeason(seasons, new Date(), {
    boardReadySeasons,
  });
  const seasonParam = one(params.season)?.trim();
  const season =
    seasonParam && seasons.includes(seasonParam) ? seasonParam : defaultSeason;
  const styleParam = one(params.style)?.trim() ?? null;
  const activeStyle = isAssignedPlayerRoleId(styleParam) ? styleParam : null;

  const groups = await getPlayerStylesDirectory(season);
  const totalPlayers = groups.reduce((n, g) => n + g.players.length, 0);

  const seasonHref = (next: string) => {
    const q = new URLSearchParams();
    q.set("season", next);
    if (activeStyle) q.set("style", activeStyle);
    return `${BASE}?${q.toString()}`;
  };
  const styleHref = (id: string | null) => {
    const q = new URLSearchParams();
    q.set("season", season);
    if (id) q.set("style", id);
    return `${BASE}?${q.toString()}`;
  };

  const styleOptions = [
    { id: "all", href: styleHref(null), label: t("stylesAll") },
    ...PLAYER_ROLE_CATALOG.map((entry) => ({
      id: entry.id,
      href: styleHref(entry.id),
      label: entry.phrase,
    })),
  ];

  const seasonOptions = seasons.slice(0, 8).map((s) => ({
    id: s,
    href: seasonHref(s),
    label: s,
  }));

  return (
    <main
      data-motion-page
      className="site-shell flex flex-col gap-6 py-6 sm:py-8"
    >
      <MotionReveal />
      <PageHeader
        title={t("stylesTitle")}
        subtitle={t("stylesSubtitle")}
        meta={
          <span className={cn(type.bodySm, "text-foreground")}>
            {t("stylesMeta", { season, count: totalPlayers })}
          </span>
        }
        about={<p>{t("stylesAbout")}</p>}
        aboutLabel={t("howThisWorks")}
      />

      <div className="flex flex-col gap-3">
        <SegmentedLinks
          label={t("stylesSeasonLabel")}
          value={season}
          options={seasonOptions}
        />
        <SegmentedLinks
          label={t("stylesFilterLabel")}
          value={activeStyle ?? "all"}
          options={styleOptions}
          size="sm"
        />
      </div>

      <PlayerStylesBoard
        groups={groups}
        season={season}
        activeStyle={activeStyle}
        styleHref={styleHref}
      />
    </main>
  );
}
