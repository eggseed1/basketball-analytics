import Link from "next/link";

import { GamePreviewPanel } from "@/components/games/game-preview-panel";
import { withBudget } from "@/data/queries/budget";
import { getGamePreview } from "@/data/queries/game-preview";
import type { Game } from "@/data/types";
import { cn } from "@/lib/utils";

export type GameTab = "preview" | "game";

export async function GamePreviewSection({ game }: { game: Game }) {
  const result = await withBudget(
    getGamePreview(game).catch(() => null),
    15_000,
    null
  );
  if (!result.value) {
    return (
      <p className="text-[13px] text-muted-foreground">
        The preview is unavailable for this game right now.
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
      aria-label="Game sections"
      className="inline-flex max-w-full self-start touch-scroll-x rounded-[var(--radius-lg)] bg-secondary p-1"
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
              "shrink-0 rounded-[var(--radius-md)] px-3.5 py-1.5 type-body-sm font-semibold transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </Link>
        );
      })}
    </nav>
  );
}
