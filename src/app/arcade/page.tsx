import { getTranslations } from "next-intl/server";
import { MotionReveal } from "@/components/continuity/motion-reveal";
import type { CSSProperties, ReactNode } from "react";

import {
  GmLabArt,
  HigherLowerArt,
  OneShotArt,
  TeammateChainArt,
  Zero82Art,
} from "@/components/arcade/arcade-card-art";
import { TransitionLink } from "@/components/continuity/query-nav";
import { PageHeader } from "@/components/layout/page-header";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  const t = await getTranslations("Arcade");
  return {
    alternates: { canonical: "/arcade" },
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

const RECOMMENDED = [
  {
    href: "/arcade/one-shot",
    titleKey: "gameOneShotTitle",
    blurbKey: "gameOneShotBlurb",
    metaKey: "gameOneShotMeta",
    art: <OneShotArt />,
    tints: ["#48b9ab", "#df668c"],
  },
  {
    href: "/gm",
    titleKey: "gmFranchiseTitle",
    blurbKey: "gmFranchiseBlurb",
    metaKey: "gmFranchiseMeta",
    art: <GmLabArt />,
    tints: ["#30d158", "#64d2ff"],
  },
] as const;

const MORE_GAMES = [
  {
    href: "/arcade/daily",
    titleKey: "gameDailyTitle",
    blurbKey: "gameDailyBlurb",
    metaKey: "gameDailyMeta",
    art: <HigherLowerArt />,
    tints: ["#30d158", "#0a84ff"],
  },
  {
    href: "/arcade/higher-or-lower",
    titleKey: "gameHigherLowerTitle",
    blurbKey: "gameHigherLowerBlurb",
    metaKey: "gameHigherLowerMeta",
    art: <HigherLowerArt />,
    tints: ["#ff9f0a", "#0a84ff"],
  },
  {
    href: "/arcade/zero-82",
    titleKey: "gameZero82Title",
    blurbKey: "gameZero82Blurb",
    metaKey: "gameZero82Meta",
    art: <Zero82Art />,
    tints: ["#d9a066", "#ff375f"],
  },
  {
    href: "/arcade/teammate-chain",
    titleKey: "gameTeammateChainTitle",
    blurbKey: "gameTeammateChainBlurb",
    metaKey: "gameTeammateChainMeta",
    art: <TeammateChainArt />,
    tints: ["#0a84ff", "#bf5af2"],
  },
] as const;

function resolveGames(
  defs: typeof RECOMMENDED | typeof MORE_GAMES,
  t: Awaited<ReturnType<typeof getTranslations<"Arcade">>>
) {
  return defs.map((game) => ({
    href: game.href,
    title: t(game.titleKey),
    blurb: t(game.blurbKey),
    meta: t(game.metaKey),
    art: game.art,
    tints: [...game.tints],
  }));
}

export default async function ArcadePage() {
  const t = await getTranslations("Arcade");
  const recommended = resolveGames(RECOMMENDED, t);
  const more = resolveGames(MORE_GAMES, t);

  return (
    <main data-motion-page className="site-shell flex flex-col gap-8 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader title={t("hubTitle")} subtitle={t("hubSubtitle")} />

      <section
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-border/80",
          "bg-foreground/[0.02] p-3 sm:p-4"
        )}
      >
        <h2
          className={cn(
            type.micro,
            "font-bold uppercase tracking-[0.12em] text-muted-foreground"
          )}
        >
          {t("sectionRecommended")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {recommended.map((game, i) => (
            <li key={game.href}>
              <ArcadeCard {...game} index={i} />
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className={type.heading}>{t("sectionPlay")}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {more.map((game, i) => (
            <li key={game.href}>
              <ArcadeCard {...game} index={recommended.length + i} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function ArcadeCard({
  href,
  title,
  blurb,
  meta,
  art,
  tints,
  index,
}: {
  href: string;
  title: string;
  blurb: string;
  meta: string;
  art: ReactNode;
  tints: string[];
  index: number;
}) {
  return (
    <TransitionLink
      href={href}
      data-motion-tile
      style={{ "--i": index } as CSSProperties}
      className={cn(
        "group sports-card flex h-full flex-col overflow-hidden",
        "transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgb(0_0_0/0.45)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <span className="relative isolate flex h-36 items-center justify-center overflow-hidden border-b border-border/60 bg-foreground/[0.02]">
        <span
          aria-hidden
          className="strip-orb -z-10"
          style={{ left: "8%", top: -20, "--orb-color": tints[0], "--orb-strength": 1.6 } as CSSProperties}
        />
        <span
          aria-hidden
          className="strip-orb strip-orb--b -z-10"
          style={{ right: "8%", bottom: -30, "--orb-color": tints[1], "--orb-strength": 1.6 } as CSSProperties}
        />
        <span className="transition-transform duration-300 group-hover:scale-105">{art}</span>
      </span>
      <span className="flex flex-1 flex-col gap-2 px-4 py-3.5">
        <span className={cn(type.body, "font-semibold")}>{title}</span>
        <span className={cn(type.caption, "text-muted-foreground")}>{blurb}</span>
        <span
          className={cn(
            type.micro,
            "mt-auto border-t border-border/70 pt-2.5 font-bold uppercase tracking-[0.1em] text-muted-foreground"
          )}
        >
          {meta}
        </span>
      </span>
    </TransitionLink>
  );
}
