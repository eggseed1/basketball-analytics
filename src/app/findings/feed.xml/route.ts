import { getLocale, getTranslations } from "next-intl/server";

import {
  ensureFindingsArchive,
  getFindingsArchive,
} from "@/data/runtime/findings-archive-snapshot";
import { intlLocale } from "@/i18n/format-date";
import { findingsRss } from "@/lib/findings-archive";
import { SITE_URL } from "@/lib/site-url";

export async function GET() {
  const locale = await getLocale();
  const t = await getTranslations("Findings");
  await ensureFindingsArchive();
  const language = intlLocale(locale);
  const body = findingsRss(getFindingsArchive().findings, {
    siteUrl: SITE_URL,
    title: t("rssTitle"),
    description: t("rssDescription"),
    language: language === "en" ? "en-us" : language,
    preseasonLabel: (season) => t("preseason", { season }),
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      // Title and channel text follow the locale cookie / Accept-Language.
      Vary: "Cookie, Accept-Language",
    },
  });
}
