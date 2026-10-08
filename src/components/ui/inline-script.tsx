/**
 * Runs during HTML parsing on a full page load, before first paint. On client
 * navigations it renders as inert text/plain, so pair it with an effect.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
