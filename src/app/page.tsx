import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-tight">
        Basketball Analytics
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Clear, fast basketball exploration built on a canonical data layer.
        Start with player usage and true shooting.
      </p>
      <p className="flex flex-wrap gap-3">
        <Link
          href="/explore/players"
          className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Explore players
        </Link>
        <Link
          href="/explore/games"
          className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Explore games
        </Link>
      </p>
    </main>
  );
}
