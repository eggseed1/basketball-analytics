import archive from "@/data/runtime/findings-archive.json";
import { findingsRss, type FindingsArchive } from "@/lib/findings-archive";
import { SITE_URL } from "@/lib/site-url";

export function GET() {
  const body = findingsRss((archive as FindingsArchive).findings, {
    siteUrl: SITE_URL,
    title: "DRBL findings",
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
