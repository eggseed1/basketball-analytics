import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Centered display equation block (textbook-style, no KaTeX dependency). */
export function MathDisplay({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl bg-secondary/70 px-4 py-5 text-center",
        className
      )}
    >
      <div className="inline-flex max-w-full flex-col items-center gap-1 font-[Georgia,ui-serif,Cambria,Times,serif] text-[18px] leading-normal text-foreground sm:text-[20px]">
        {children}
      </div>
    </div>
  );
}

export function MathEq({
  lhs,
  rhs,
}: {
  lhs: ReactNode;
  rhs: ReactNode;
}) {
  return (
    <div className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <span className="whitespace-nowrap">{lhs}</span>
      <span aria-hidden="true" className="text-muted-foreground">
        =
      </span>
      <span className="inline-flex flex-wrap items-center justify-center gap-x-2">
        {rhs}
      </span>
    </div>
  );
}

/** Vertical fraction a/b with a rule. */
export function MathFrac({
  num,
  den,
}: {
  num: ReactNode;
  den: ReactNode;
}) {
  return (
    <span className="inline-flex flex-col items-center px-1 align-middle text-[0.92em] leading-tight">
      <span className="px-1 pb-0.5">{num}</span>
      <span
        aria-hidden="true"
        className="w-full border-t border-foreground/80"
      />
      <span className="px-1 pt-0.5">{den}</span>
    </span>
  );
}

export function MathMul({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      {children}
    </span>
  );
}

export function MathOp({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function MathVar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("whitespace-nowrap italic", className)}>{children}</span>
  );
}

export function MathRoman({ children }: { children: ReactNode }) {
  return <span className="not-italic whitespace-nowrap">{children}</span>;
}

export function MathNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 max-w-prose text-center font-sans text-[12px] leading-snug text-muted-foreground not-italic">
      {children}
    </p>
  );
}

export function MathStack({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {title ? (
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
      ) : null}
      {children}
    </div>
  );
}
