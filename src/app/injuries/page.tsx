import { MotionReveal } from "@/components/continuity/motion-reveal";
import {
  InjuryReportList,
  injuryReportSummary,
} from "@/components/home/injury-report-panel";
import { PageHeader } from "@/components/layout/page-header";
import { getInjuryReport } from "@/data/queries/injury-report";

export const metadata = {
  title: "Injury report",
  description:
    "NBA players listed out or day-to-day, from ESPN's injury feed. Return dates are estimates.",
  alternates: { canonical: "/injuries" },
};

export const revalidate = 900;

export default async function InjuriesPage() {
  const report = await getInjuryReport().catch(() => null);
  const entries = report?.entries ?? [];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    new Date()
  );

  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title="Injury report"
        subtitle={
          entries.length
            ? injuryReportSummary(entries)
            : "No players are listed right now."
        }
        about="Biggest scorers come first. Players listed out come ahead of day-to-day, and rest days come last. Return dates are estimates and often move."
      />
      {entries.length ? (
        <section className="sports-card px-4 py-2 sm:px-5">
          <InjuryReportList entries={entries} today={today} />
        </section>
      ) : null}
    </main>
  );
}
