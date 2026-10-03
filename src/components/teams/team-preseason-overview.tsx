import Link from "next/link";

import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const linkClass = "font-semibold text-foreground underline-offset-2 hover:underline";

export function TeamPreseasonOverview({
  season,
  teamName,
  teamId,
}: {
  season: string;
  teamName: string;
  teamId: string;
}) {
  const href = (tab: string) =>
    `/teams/${teamId}?tab=${tab}&season=${encodeURIComponent(season)}`;

  return (
    <p className={cn(type.bodySm, "text-muted-foreground")}>
      Strengths, weaknesses and league percentiles for {teamName} appear once {season} games are
      played. Live now:{" "}
      <Link href={href("players")} className={linkClass}>
        roster
      </Link>
      ,{" "}
      <Link href={href("organization")} className={linkClass}>
        cap and transactions
      </Link>{" "}
      and the{" "}
      <Link href={href("schedule")} className={linkClass}>
        {season} schedule
      </Link>
      .
    </p>
  );
}
