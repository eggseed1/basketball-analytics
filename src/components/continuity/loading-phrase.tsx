"use client";

import { useEffect, useState } from "react";

import {
  initialLoadingPhrase,
  LOADING_PHRASE_ROTATE_MS,
  loadingPhraseStartIndex,
  loadingPhrasesFor,
  type LoadingContext,
} from "@/lib/loading-phrases";
import { cn } from "@/lib/utils";

/**
 * Cycles short, destination-aware loading lines while a skeleton is up.
 * SSR paints phrase[0]; the first timer tick picks a rotating start so visits
 * don't feel glued to the first one or two lines.
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
    let next = loadingPhraseStartIndex(context);
    const id = window.setInterval(() => {
      setIndex(next);
      next = (next + 1) % phrases.length;
    }, LOADING_PHRASE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [context, phrases]);

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
