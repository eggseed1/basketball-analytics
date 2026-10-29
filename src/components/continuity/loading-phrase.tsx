"use client";

import { useEffect, useState } from "react";

import {
  initialLoadingPhrase,
  loadingPhrasesFor,
  type LoadingContext,
} from "@/lib/loading-phrases";
import { cn } from "@/lib/utils";

const ROTATE_MS = 2200;

/**
 * Cycles short, destination-aware loading lines while a skeleton is up.
 * First paint uses the stable initial phrase (SSR-safe).
 */
export function LoadingPhrase({
  context,
  className,
}: {
  context: LoadingContext;
  className?: string;
}) {
  const phrases = loadingPhrasesFor(context);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (phrases.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % phrases.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [phrases]);

  const text = phrases[index] ?? initialLoadingPhrase(context);

  return (
    <span
      className={cn(
        "inline-block min-h-[1.25em] transition-opacity duration-300",
        className
      )}
      key={text}
    >
      {text}
    </span>
  );
}
