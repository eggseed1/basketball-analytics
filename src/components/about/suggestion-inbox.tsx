"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

type Note = { id: string; text: string; page: string; createdAt: string };

export function SuggestionInbox() {
  const [key, setKey] = useState("");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/suggestions", {
      headers: { "x-suggestions-key": key },
    });
    if (!response.ok) {
      setNotes(null);
      setError(
        response.status === 404
          ? "That key did not open the list. On the worker, SUGGESTIONS_READ_KEY has to match."
          : "The list is not reachable right now."
      );
      return;
    }
    const body = (await response.json()) as { notes?: Note[] };
    setNotes(body.notes ?? []);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-foreground">Read key</span>
          <input
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            autoComplete="current-password"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </label>
        <Button type="submit">Open</Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notes && notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : null}
      {notes && notes.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md border border-border px-3 py-3">
              <p className="text-sm text-foreground">{note.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {note.createdAt.slice(0, 16).replace("T", " ")}
                {note.page ? ` · ${note.page}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
