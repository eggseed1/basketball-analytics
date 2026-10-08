const MARK = "data-col-hover";

/**
 * Marks the hovered body cell's column (and its header, when the header has no
 * spanning cells) with [data-col-hover="on"] for the crosshair tint in
 * globals.css. Only a column change touches the DOM, so moving down a column or
 * scrolling under a still pointer costs nothing.
 *
 * A column switches without transitions, since hundreds of cells fading at once
 * would restyle every frame. Cells leaving it sit at "off" until that style has
 * landed, then lose the mark.
 */
export function watchTableCrosshair(root: Element) {
  let marked: Element[] = [];
  let table: HTMLTableElement | null = null;
  let column = -1;

  const mark = (next: HTMLTableElement | null, index: number) => {
    if (next === table && index === column) return;
    const leaving = marked;
    for (const el of leaving) el.setAttribute(MARK, "off");
    if (leaving.length) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          for (const el of leaving) if (el.getAttribute(MARK) === "off") el.removeAttribute(MARK);
        }),
      );
    }
    marked = [];
    table = next;
    column = index;
    // The first column holds names, which carry their own row treatment.
    if (!next || index < 1) return;
    for (const body of next.tBodies) {
      for (const row of body.rows) {
        const cell = row.cells[index];
        if (cell?.tagName === "TD") marked.push(cell);
      }
    }
    const head = next.tHead;
    if (head && !head.querySelector("[colspan]")) {
      const cell = head.rows[head.rows.length - 1]?.cells[index];
      if (cell) marked.push(cell);
    }
    for (const el of marked) el.setAttribute(MARK, "on");
  };

  const over = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const cell = event.target instanceof Element ? event.target.closest("td") : null;
    const body = cell?.parentElement?.parentElement;
    const next =
      cell && body?.tagName === "TBODY" && body.parentElement instanceof HTMLTableElement && root.contains(body)
        ? body.parentElement
        : null;
    mark(next, next && cell ? cell.cellIndex : -1);
  };
  const leave = () => mark(null, -1);

  document.addEventListener("pointerover", over, { passive: true });
  document.documentElement.addEventListener("pointerleave", leave);
  return () => {
    document.removeEventListener("pointerover", over);
    document.documentElement.removeEventListener("pointerleave", leave);
    for (const el of root.querySelectorAll(`[${MARK}]`)) el.removeAttribute(MARK);
  };
}
