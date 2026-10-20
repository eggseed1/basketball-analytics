import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";

import { GamePreviewPanel } from "@/components/games/game-preview-panel";
import { withBudget } from "@/data/queries/budget";
import { getGamePreview } from "@/data/queries/game-preview";
import type { Game } from "@/data/types";
import { cn } from "@/lib/utils";
import {
  segmentedItemActiveClassName,
  segmentedItemClassName,
  segmentedItemIdleClassName,
  segmentedTrackClassName,
} from "@/components/ui/segmented-style";

export type GameTab = "preview" | "game";

export async function GamePreviewSection({ game }: { game: Game }) {
  const result = await withBudget(
    getGamePreview(game).catch(() => null),
    15_000,
    null
  );
  if (!result.value) {
    const t = await getTranslations("Games");
    return (
      <p className="text-[13px] text-muted-foreground">
        {t("previewUnavailable")}
      </p>
    );
  }
  return <GamePreviewPanel data={result.value} />;
}

export function GameTabs({
  gameId,
  active,
  options,
  defaultTab,
  query,
}: {
  gameId: string;
  active: GameTab;
  options: Array<{ id: GameTab; label: string }>;
  defaultTab: GameTab;
  query: Record<string, string | string[] | undefined>;
}) {
  const t = useTranslations("Games");
  const hrefFor = (id: GameTab) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key === "tab" || value == null) continue;
      for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
    }
    if (id !== defaultTab) params.set("tab", id);
    const qs = params.toString();
    return `/games/${encodeURIComponent(gameId)}${qs ? `?${qs}` : ""}`;
  };
  return (
    <nav
      aria-label={t("tabsAria")}
      className={cn(segmentedTrackClassName, "touch-scroll-x")}
    >
      {options.map((opt) => {
        const isActive = opt.id === active;
        return (
          <Link
            key={opt.id}
            href={hrefFor(opt.id)}
            scroll={false}
            replace
            aria-current={isActive ? "page" : undefined}
            className={cn(
              segmentedItemClassName,
              "px-3.5 py-1.5 type-body-sm",
              isActive ? segmentedItemActiveClassName : segmentedItemIdleClassName
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </nav>
  );
}
