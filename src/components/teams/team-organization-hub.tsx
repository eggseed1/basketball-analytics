import { type, sectionLinkClassName } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const JUMPS = [
  { href: "#movement", label: "Movement" },
  { href: "#sentiment", label: "Sentiment" },
  { href: "#transactions", label: "Transactions" },
  { href: "#ask", label: "Ask DRBL" },
] as const;

/**
 * Organization tab hub — one job: orient into movement / sentiment / transactions.
 * Payroll and contracts live on their own tab.
 */
export function TeamOrganizationHub() {
  return (
    <header className="flex flex-col gap-3">
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">Organization</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          Roster movement, fan sentiment and transactions. Payroll and contracts
          have their own tab.
        </p>
      </div>
      <nav
        aria-label="Organization sections"
        className="flex flex-wrap gap-x-4 gap-y-2"
      >
        {JUMPS.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={cn(type.caption, sectionLinkClassName)}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
