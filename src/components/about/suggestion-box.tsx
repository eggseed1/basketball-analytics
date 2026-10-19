"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

export function SuggestionBox() {
  const [text, setText] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          page: window.location.pathname,
          company,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setStatus("error");
        setError(body?.error || "That didn't send. Try again in a minute.");
        return;
      }
      setText("");
      setStatus("sent");
    } catch {
      setStatus("error");
      setError("That didn't send. Try again in a minute.");
    }
  }

  return (
    <form id="suggestions" onSubmit={onSubmit} className="flex scroll-mt-24 flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-semibold text-foreground">What should we build?</span>
        <textarea
          name="suggestion"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (status === "sent" || status === "error") setStatus("idle");
          }}
          required
          minLength={8}
          maxLength={1500}
          rows={5}
          placeholder="A stat, a page, a game, or a fix."
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <label className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        Company
        <input
          name="company"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending" : "Send"}
        </Button>
        {status === "sent" ? (
          <p className="text-sm text-foreground">Got it. We&apos;ll read it.</p>
        ) : null}
        {status === "error" ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <p className="text-sm text-muted-foreground">
        We keep the words, the page you sent them from, and the time. No name and no email.
      </p>
    </form>
  );
}
