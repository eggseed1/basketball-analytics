import type { SitemapKind } from "@/lib/sitemap-entries";
import { SITEMAP_HEADERS, urlsetXml } from "@/lib/sitemap-xml";

export function sitemapKindGet(kind: SitemapKind) {
  return async function GET() {
    return new Response(await urlsetXml(kind), { headers: SITEMAP_HEADERS });
  };
}
