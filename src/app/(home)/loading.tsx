import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return <span className={cn("block animate-pulse rounded-full bg-foreground/[0.08]", className)} />;
}

function Card({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <div className={cn("sports-card flex flex-col gap-3 p-4", className)}>{children}</div>;
}

function CardHeader({ wide = "w-40" }: { wide?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Bar className={cn("h-4", wide)} />
      <Bar className="h-3 w-64 max-w-full opacity-70" />
    </div>
  );
}

/** Home skeleton in the shape of the real page, so nothing jumps when it lands. */
export default function Loading() {
  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:py-7" aria-busy="true" aria-live="polite">
      <div className="query-updating-bar rounded-full" />

      <Card className="flex-row items-center gap-4">
        <span className="size-10 shrink-0 animate-pulse rounded-full bg-foreground/[0.08]" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Bar className="h-4 w-48" />
          <Bar className="h-3 w-80 max-w-full opacity-70" />
        </div>
      </Card>

      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <Card key={i} className="w-[168px] shrink-0 gap-2.5 p-3">
            <Bar className="h-3 w-16 opacity-70" />
            <div className="flex items-center gap-2">
              <span className="size-6 animate-pulse rounded-full bg-foreground/[0.08]" />
              <Bar className="h-3 flex-1" />
            </div>
            <div className="flex items-center gap-2">
              <span className="size-6 animate-pulse rounded-full bg-foreground/[0.08]" />
              <Bar className="h-3 flex-1" />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21.25rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="gap-4">
            <CardHeader wide="w-36" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-[12px] p-3 ring-1 ring-inset ring-foreground/[0.06]">
                  <div className="flex items-center justify-between">
                    <Bar className="h-3.5 w-28" />
                    <div className="flex gap-1.5">
                      <span className="size-5 animate-pulse rounded-full bg-foreground/[0.08]" />
                      <span className="size-5 animate-pulse rounded-full bg-foreground/[0.08]" />
                    </div>
                  </div>
                  <span className="block h-[86px] animate-pulse rounded-[8px] bg-foreground/[0.05]" />
                  <Bar className="h-3 w-3/4 opacity-70" />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader />
            <span className="block h-40 animate-pulse rounded-[10px] bg-foreground/[0.05]" />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {[5, 6, 4].map((rows, i) => (
            <Card key={i}>
              <CardHeader wide="w-32" />
              {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="flex items-center gap-2.5">
                  <span className="size-7 shrink-0 animate-pulse rounded-full bg-foreground/[0.08]" />
                  <Bar className="h-3 flex-1" />
                  <Bar className="h-3 w-10" />
                </div>
              ))}
            </Card>
          ))}
        </div>
      </div>

      <p className="sr-only">Loading the home page…</p>
    </main>
  );
}
