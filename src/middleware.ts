import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Locale is cookie + Accept-Language driven (no URL prefix).
 *
 * Keep the legacy `middleware.ts` + Edge runtime name: Next 16 `proxy.ts` is
 * Node middleware, and `@opennextjs/cloudflare` still rejects that at build.
 *
 * Note: Next.js App Router may overwrite `Vary` set here with its RSC router
 * fields (known regression vs middleware Vary merge). Cloudflare PAGE_CACHE in
 * worker.ts therefore keys HTML by resolved locale. We still set Vary and an
 * explicit marker so any layer that preserves middleware headers stays honest.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html") || accept.includes("*/*")) {
    const vary = response.headers.get("Vary");
    const extras = ["Cookie", "Accept-Language"];
    response.headers.set(
      "Vary",
      vary
        ? Array.from(new Set([...vary.split(",").map((s) => s.trim()), ...extras])).join(", ")
        : extras.join(", ")
    );
    response.headers.set("x-drbl-locale-vary", "Cookie, Accept-Language");
  }
  return response;
}

export const config = {
  runtime: "experimental-edge",
  matcher: [
    /*
     * Skip static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
