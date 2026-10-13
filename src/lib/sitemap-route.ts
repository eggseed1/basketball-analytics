import type { SitemapKind } from "@/lib/sitemap-entries";
import { SITEMAP_HEADERS, urlsetXml } from "@/lib/sitemap-xml";

export function sitemapKindGet(kind: SitemapKind) {
  return function GET() {
    return new Response(urlsetXml(kind), { headers: SITEMAP_HEADERS });
  };
}
