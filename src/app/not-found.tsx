import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MotionReveal } from "@/components/continuity/motion-reveal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Errors");
  return { title: t("notFoundMetaTitle") };
}

export default async function NotFound() {
  const t = await getTranslations("Errors");
  const sections = [
    { href: "/scores", label: t("scores") },
    { href: "/explore/players", label: t("players") },
    { href: "/standings", label: t("teams") },
  ];

  return (
    <main data-motion-page className="site-shell flex min-h-[60vh] flex-1 items-center py-8">
      <MotionReveal />
      <section className="w-full rounded-lg border border-border bg-background/70 p-5 shadow-sm sm:p-7">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("notFoundCode")}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {t("notFoundTitle")}
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          {t("notFoundHint")}
        </p>
        <div data-motion-list className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-md border border-foreground bg-foreground px-4 py-2 text-[13px] font-semibold text-background"
          >
            {t("goHome")}
          </Link>
          {sections.map((s) => (
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
