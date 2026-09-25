import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

const JUMPS = [
  { href: "#front-office", label: "Front office" },
  { href: "#movement", label: "Movement" },
  { href: "#sentiment", label: "Sentiment" },
  { href: "#assets", label: "Cap & assets" },
  { href: "#transactions", label: "Transactions" },
  { href: "#ask", label: "Ask DRBL" },
] as const;

/**
 * Organization tab hub — one job: orient into FO / assets / movement sections.
 */
export function TeamOrganizationHub({
  season,
  frontOfficeSeason,
}: {
  season: string;
  frontOfficeSeason: string;
}) {
  const payrollNote =
    season !== frontOfficeSeason
      ? `Payroll and draft capital stay on the current ${frontOfficeSeason} ledger while you browse ${season} stats.`
      : `Payroll, draft capital, and movement for ${frontOfficeSeason}.`;

  return (
    <header className="flex flex-col gap-3">
      <div>
        <h2 className="text-[20px] font-bold tracking-tight">Organization</h2>
        <p className={cn(type.bodySm, "text-muted-foreground")}>
          {payrollNote} Missing ledger rows stay blank — never invented as zero.
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
            className={cn(type.caption, "font-semibold underline")}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
