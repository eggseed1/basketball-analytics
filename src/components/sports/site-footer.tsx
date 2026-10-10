import { TransitionLink } from "@/components/continuity/query-nav";

export function SiteFooter() {
  return (
    <footer className="site-shell mt-auto border-t border-border py-5 text-[13px] text-muted-foreground">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="max-w-prose leading-5">
          Not affiliated with or endorsed by the NBA or any of its teams. Team names, logos and
          player images belong to their owners.
        </p>
        <nav aria-label="Site policies" className="flex shrink-0 gap-4">
          <TransitionLink href="/sources" className="hover:text-foreground hover:underline">
            Sources
          </TransitionLink>
          <TransitionLink href="/terms" className="hover:text-foreground hover:underline">
            Terms
          </TransitionLink>
          <TransitionLink href="/privacy" className="hover:text-foreground hover:underline">
            Privacy
          </TransitionLink>
        </nav>
      </div>
    </footer>
  );
}
