import { PlayoffBracketSkeleton } from "@/components/explore/playoff-bracket";
import type { HomeLayout, HomeModuleId, HomeSeasonPhase } from "@/lib/home-season-moment";
import { cn } from "@/lib/utils";

/*
 * Heights are the rendered module heights on a phone (390px) and at lg+
 * (1280px), so a module lands in the space its placeholder held. Modules whose
 * length follows the data can still settle a little.
 */
const HEIGHT: Record<HomeModuleId, string> = {
  moment: "h-[52px] sm:h-8",
  "phase-bar": "h-9 sm:h-4",
  calendar: "h-[168px]",
  bracket: "",
  standings: "h-[567px] lg:h-[575px]",
  "standings-race": "h-80",
  findings: "h-[1673px] lg:h-[925px]",
  "above-norm": "h-[414px] lg:h-[424px]",
  injuries: "h-[576px] lg:h-[586px]",
  "league-moves": "h-[803px] lg:h-[813px]",
  "top-performers": "h-[668px] lg:h-[678px]",
  "hot-cold": "h-40",
  transactions: "h-[266px] lg:h-[238px]",
  watchlist: "h-[214px] lg:h-[224px]",
  sentiment: "h-[660px] lg:h-[368px]",
  "season-glance": "h-[2315px] lg:h-[1320px]",
  news: "h-[715px] lg:h-[596px]",
};

function Bar({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded-full bg-foreground/[0.08]", className)} />;
}

/** Offseason phases lead with a full card instead of a one-line status. */
const CARD_MOMENT: HomeSeasonPhase[] = ["draft-free-agency", "offseason"];

/**
 * Placeholder for one homepage module. `data-skeleton` keeps it out of the
 * page entry motion, so it holds still and only the real module fades in.
 */
export function HomeModuleSkeleton({ id, phase }: { id: HomeModuleId; phase?: HomeSeasonPhase }) {
  if (id === "moment" && !(phase && CARD_MOMENT.includes(phase))) {
    return (
      <div data-skeleton aria-hidden className={cn("flex flex-col justify-center border-l-[3px] border-foreground/10 pl-3.5", HEIGHT.moment)}>
        <Bar className="h-4 w-56 max-w-full" />
      </div>
    );
  }
  if (id === "bracket") return <PlayoffBracketSkeleton />;
  if (id === "phase-bar") {
    return (
      <div data-skeleton aria-hidden className={cn("flex items-center", HEIGHT["phase-bar"])}>
        <Bar className="h-3 w-72 max-w-full" />
      </div>
    );
  }
  return (
    <div
      data-skeleton
      aria-hidden
      className={cn(
        "sports-card flex flex-col gap-3 overflow-hidden p-4 sm:p-5",
        id === "moment" ? "h-44" : HEIGHT[id]
      )}
    >
      <Bar className="h-4 w-40" />
      <Bar className="h-3 w-64 max-w-full opacity-70" />
      <span className="mt-1 block min-h-0 flex-1 animate-pulse rounded-[10px] bg-foreground/[0.05]" />
    </div>
  );
}

/** The homepage grid with every module as a placeholder. */
export function HomeLayoutSkeleton({ layout, phase }: { layout: HomeLayout; phase: HomeSeasonPhase }) {
  const cell = (id: HomeModuleId) =>
    id === "watchlist" ? (
      <div key={id} className="order-first min-w-0 lg:order-none">
        <HomeModuleSkeleton id={id} phase={phase} />
      </div>
    ) : (
      <HomeModuleSkeleton key={id} id={id} phase={phase} />
    );
  return (
    <>
      {layout.top.map((id) => (
        <HomeModuleSkeleton key={id} id={id} phase={phase} />
      ))}
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21.25rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">{layout.main.map(cell)}</div>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">{layout.side.map(cell)}</div>
      </div>
      {layout.bottom.map((id) => (
        <HomeModuleSkeleton key={id} id={id} phase={phase} />
      ))}
    </>
  );
}
