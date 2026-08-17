import Link from "next/link";

import { MetricHelp } from "@/components/learn/metric-help";
import { PlayerIdentity } from "@/components/players/player-identity";
import type { TeamAssetLedger } from "@/data/types/team-assets";
import { formatNumber } from "@/lib/format";
import { AppLink } from "@/components/ui/app-link";

/**
 * Team Cap / Assets strip — only shows verified categories.
 * Draft capital / TPEs / rights remain honest “unavailable” until structured ingest.
 */
export function TeamAssetsSection({
  ledger,
  teamKey,
}: {
  ledger: TeamAssetLedger;
  teamKey: string;
}) {
  const playerCat = ledger.categories.find((c) => c.id === "players");
  const blocked = ledger.categories.filter(
    (c) => c.availability === "blocked_pending_structured_source"
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-[13px] text-muted-foreground">
          Verified inventory only.{" "}
          <MetricHelp conceptId="structured_transaction">
            Structured transactions
          </MetricHelp>{" "}
          and asset genealogy stay blocked until a licensed ledger exists —
          ESPN source events never invent picks or exceptions.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-[14px] font-bold tracking-tight">
          Players
          {playerCat ? (
            <span className="ml-2 text-[12px] font-semibold text-muted-foreground">
              {playerCat.count}
            </span>
          ) : null}
        </h3>
        {ledger.players.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {playerCat?.availability === "unsupported"
              ? (playerCat.note ??
                ledger.warning ??
                "Historical player assets unavailable for this season.")
              : playerCat?.availability === "timeout" ||
                  playerCat?.availability === "provider_error"
                ? (playerCat.note ??
                  ledger.warning ??
                  "Player assets unavailable for this snapshot.")
                : (playerCat?.note ??
                  "No verified player assets for this snapshot.")}
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {ledger.players.slice(0, 12).map((p) => (
              <li
                key={p.playerId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <PlayerIdentity
                  playerId={p.playerId}
                  name={p.playerName}
                  teamKey={teamKey}
                  teamLabel={teamKey}
                  position={p.position}
                  season={p.season}
                  href={p.href}
                  variant="compact"
                  className="min-w-0 flex-1"
                  nameClassName="gap-3 no-underline hover:underline"
                />
                {p.pointsPerGame != null ? (
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {formatNumber(p.pointsPerGame, 1)} PPG
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {ledger.players.length > 12 ? (
          <p className="text-[12px] text-muted-foreground">
            Showing 12 of {ledger.players.length}. See full roster above.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-[14px] font-bold tracking-tight">
          Cap &amp; draft assets
        </h3>
        <ul className="flex flex-col gap-2">
          {blocked.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-dashed border-border/80 px-3 py-2.5"
            >
              <p className="text-[13px] font-semibold">{c.label}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {c.id === "trade_exceptions" ? (
                  <>
                    <MetricHelp conceptId="trade_exception">
                      Trade Exception
                    </MetricHelp>{" "}
                    data unavailable —{" "}
                  </>
                ) : null}
                {c.id === "draft_capital" ? (
                  <>
                    <MetricHelp conceptId="draft_capital">
                      Draft capital
                    </MetricHelp>{" "}
                    —{" "}
                  </>
                ) : null}
                {c.note}
              </p>
              {c.id === "trade_exceptions" ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  <MetricHelp conceptId="salary_fit">Salary fit</MetricHelp>{" "}
                  lists and{" "}
                  <MetricHelp conceptId="trade_legality">
                    trade legality
                  </MetricHelp>{" "}
                  stay separate — fit will never imply a legal trade until a
                  deterministic validator exists.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <p className="text-[11px] text-muted-foreground">
        Genealogy UI ready: {ledger.genealogyUiReady ? "yes" : "no"} ·{" "}
        <AppLink
          href="/offseason"
          className="font-semibold underline-offset-2 hover:underline"
        >
          Offseason Tracker
        </AppLink>{" "}
        ·{" "}
        <Link
          href="/learn/transaction-layers"
          className="font-semibold underline-offset-2 hover:underline"
        >
          Learn transaction layers
        </Link>
      </p>
    </div>
  );
}
