import Link from "next/link";

import type { TeamContractsView } from "@/data/queries/team-contracts";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/** Unsigned draft picks whose NBA rights the team still holds, as BRef lists them. */
export function TeamDraftRightsTable({ data }: { data: TeamContractsView }) {
  if (!data.draftRights.length) {
    return (
      <p className={cn(type.caption, "text-muted-foreground")}>
        No unsigned draft picks. Basketball-Reference lists no players whose rights this team holds.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border/80">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <th className="px-2 py-1.5 font-semibold">Player</th>
            <th className="px-2 py-1.5 text-right font-semibold">Age</th>
            <th className="px-2 py-1.5 font-semibold">Drafted</th>
            <th className="px-2 py-1.5 font-semibold">Playing for</th>
          </tr>
        </thead>
        <tbody>
          {data.draftRights.map((r) => (
            <tr key={r.brefId} className="border-b border-border/50">
              <td className="px-2 py-1.5 font-semibold">
                {data.hrefs[r.brefId] ? (
                  <Link href={data.hrefs[r.brefId]!} className="underline-offset-2 hover:underline">
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r.age ?? "—"}</td>
              <td className="px-2 py-1.5 tabular-nums">
                {r.draftYear ?? "—"}
                {r.draftTeam ? ` ${r.draftTeam}` : ""}
                {r.round && r.pick ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · round {r.round}, {ordinal(r.pick)} pick
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                {r.club ?? "—"}
                {r.country ? ` (${r.country})` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
