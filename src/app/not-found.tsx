import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
};

const SECTIONS = [
  { href: "/scores", label: "Scores" },
  { href: "/explore/players", label: "Players" },
  { href: "/explore/teams", label: "Teams" },
  { href: "/standings", label: "Standings" },
];

export default function NotFound() {
  return (
    <main className="site-shell flex min-h-[60vh] flex-1 items-center py-8">
      <section className="w-full rounded-lg border border-border bg-background/70 p-5 shadow-sm sm:p-7">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          404
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          We couldn&apos;t find that page.
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          The link may be old, or the player, team, or game ID in it may be wrong.
          Search from the bar above or pick a section below.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-md border border-foreground bg-foreground px-4 py-2 text-[13px] font-semibold text-background"
          >
            Go home
          </Link>
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-md border border-border px-4 py-2 text-[13px] font-semibold hover:bg-muted"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
