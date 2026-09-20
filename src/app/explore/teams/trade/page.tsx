import { TradeSimulator } from "@/components/trade/trade-simulator";
import { PageHeader } from "@/components/layout/page-header";
import { loadTradeSimulatorBoard } from "@/data/queries/trade-simulator";

export const metadata = {
  title: "Trade simulator",
  description:
    "Swap real roster players and compare known salaries and DRBL/100. Not a cap-legality ruling.",
};

export default async function TradeSimulatorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const board = loadTradeSimulatorBoard();
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const list = (key: string) =>
    (one(key) ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <PageHeader
        eyebrow="Teams"
        title="Trade simulator"
        subtitle="Two-team player swaps with known salaries, DRBL, WAR1, BPM, season rates, package shape, and room to published cap lines. Picks and exceptions stay out. Cap placement is not a legality ruling."
      />
      {board ? (
        <TradeSimulator
          board={board}
          initialA={one("a")}
          initialB={one("b")}
          initialGive={list("give")}
          initialGet={list("get")}
        />
      ) : (
        <p className="text-[14px] text-muted-foreground">
          No payroll snapshot is loaded, so the simulator has nothing to swap.
        </p>
      )}
    </main>
  );
}
