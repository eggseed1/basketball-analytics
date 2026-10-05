import { formatOrdinal as ordinal } from "@/lib/format";

export function PlayerNotYetPlayed({
  playerName,
  draftYear,
  overall,
}: {
  playerName: string;
  draftYear: number;
  overall: number;
}) {
  return (
    <section
      className="sports-card flex min-h-[12rem] flex-col justify-center gap-2 p-5 text-center"
      aria-label="No NBA games yet"
    >
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        No NBA games yet
      </p>
      <p className="mx-auto max-w-md text-[15px] leading-relaxed text-foreground">
        {playerName} was the {ordinal(overall)} pick in the {draftYear} NBA Draft and hasn&apos;t
        played a regular-season or playoff game.
      </p>
      <p className="mx-auto max-w-md text-[13px] leading-relaxed text-muted-foreground">
        Percentiles, season stats and game logs fill in after his first game.
      </p>
    </section>
  );
}
