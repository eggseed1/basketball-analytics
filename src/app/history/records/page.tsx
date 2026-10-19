import { MotionReveal } from "@/components/continuity/motion-reveal";
import { RecordBookBoard } from "@/components/history/record-book";
import { PageHeader } from "@/components/layout/page-header";
import { getRecordBook } from "@/data/runtime/record-book";
import { formatRecordDate } from "@/lib/record-book";

export const metadata = {
  title: "Record book",
  description:
    "NBA and BAA records from 1946-47 on. Leader lists come from Basketball-Reference. Lines those pages do not publish are counted from 1996-97 game logs.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "front";
}

export default async function RecordBookPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const book = getRecordBook();
  const through = book.throughDate ? formatRecordDate(book.throughDate) : null;
  const ready = Boolean(book.throughSeason && book.records.length);

  return (
    <main data-motion-page className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
      <PageHeader
        title="Record book"
        subtitle={
          ready
            ? `NBA and BAA records from ${book.fromSeason} through ${book.throughSeason}${through ? `, with modern game logs through ${through}` : ""}.`
            : "The book is still being counted."
        }
        about={<p>{book.note}</p>}
        aboutLabel="What is counted"
      />
      {ready ? <RecordBookBoard book={book} view={first(params.view)} /> : null}
    </main>
  );
}
