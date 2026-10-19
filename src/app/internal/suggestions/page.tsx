import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SuggestionInbox } from "@/components/about/suggestion-inbox";
import { readSuggestions } from "@/lib/suggestions-store";

export const metadata: Metadata = {
  title: "Suggestions",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SuggestionsInboxPage() {
  const open = process.env.NODE_ENV !== "production";
  const board = open ? await readSuggestions() : null;

  return (
    <main className="site-shell flex flex-col gap-6 py-6 sm:py-8">
      <PageHeader
        title="Suggestions"
        subtitle="Notes people sent from the box on the about page."
      />
      {open && board ? (
        board.unavailable ? (
          <p className="text-sm text-muted-foreground">The list is not reachable right now.</p>
        ) : board.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="flex max-w-2xl flex-col gap-3">
            {board.notes.map((note) => (
              <li key={note.id} className="rounded-md border border-border px-3 py-3">
                <p className="text-sm text-foreground">{note.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {note.createdAt.slice(0, 16).replace("T", " ")}
                  {note.page ? ` · ${note.page}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : (
        <SuggestionInbox />
      )}
    </main>
  );
}
