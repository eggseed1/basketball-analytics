"use client";

import { useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Consequences appear before an irreversible roster decision. Escape cancels. */
export function GmConfirmAction({ label, title, children, confirmLabel, onConfirm, disabled = false }: {
  label: string;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  return <>
    <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-7" disabled={disabled} onClick={() => dialog.current?.showModal()}>{label}</Button>
    <dialog ref={dialog} className="gm-confirm" aria-labelledby={id + "-title"} aria-describedby={id + "-detail"}>
      <h2 id={id + "-title"} className="text-lg font-bold">{title}</h2>
      <div id={id + "-detail"} className="mt-3 space-y-2 text-sm text-muted-foreground">{children}</div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => dialog.current?.close()}>Cancel</Button>
        <Button type="button" variant="destructive" className="min-h-11" onClick={() => { dialog.current?.close(); onConfirm(); }}>{confirmLabel}</Button>
      </div>
    </dialog>
  </>;
}
