import Link from "next/link";

/** Controlled unavailable state — never invent ? 0-0 FINAL. */
export function GameUnavailablePanel({
  gameId,
  backHref = "/explore/games",
}: {
  gameId: string;
  backHref?: string;
}) {
  return (
    <div className="sports-card flex flex-col gap-3 p-6">
      <h1 className="text-[20px] font-semibold tracking-tight">
        Game unavailable
      </h1>
      <p className="text-[14px] text-muted-foreground">
        We couldn&apos;t resolve the game data for this link. No score or team
        identity is shown when the game cannot be loaded.
      </p>
      <p className="text-[12px] tabular-nums text-muted-foreground">
        Reference: {gameId}
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-[14px]">
        <Link href={backHref} className="font-semibold underline-offset-4 hover:underline">
          Back to games
        </Link>
        <Link href="/explore" className="underline-offset-4 hover:underline">
          Search
        </Link>
      </div>
    </div>
  );
}
