"use client";

import { useTranslations } from "next-intl";

import { TransitionLink } from "@/components/continuity/query-nav";

export function SiteFooter() {
  const t = useTranslations("Footer");
  return (
    <footer className="site-shell mt-auto border-t border-border py-5 text-[13px] text-muted-foreground">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="max-w-prose leading-5">{t("disclaimer")}</p>
        <nav aria-label={t("policies")} className="flex min-w-0 shrink-0 flex-wrap gap-x-4 gap-y-2">
          <TransitionLink href="/about" className="hover:text-foreground hover:underline">
            {t("about")}
          </TransitionLink>
          <TransitionLink
            href="/about#suggestions"
            className="hover:text-foreground hover:underline"
          >
            {t("suggestions")}
          </TransitionLink>
          <TransitionLink href="/sources" className="hover:text-foreground hover:underline">
            {t("sources")}
          </TransitionLink>
          <TransitionLink href="/terms" className="hover:text-foreground hover:underline">
            {t("terms")}
          </TransitionLink>
          <TransitionLink href="/privacy" className="hover:text-foreground hover:underline">
            {t("privacy")}
          </TransitionLink>
        </nav>
      </div>
    </footer>
  );
}
