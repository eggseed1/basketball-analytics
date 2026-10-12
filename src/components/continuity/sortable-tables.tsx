"use client";

import { useEffect } from "react";

type Dir = "asc" | "desc";
type Kind = "number" | "season" | "text";
type SortState = { key: string; dir: Dir };
type Value = number | string | null;

const SCOPE = "[data-sortable-tables]";
const INTERACTIVE = "button, a, input, select, summary, [role='button']";
const MISSING = new Set(["", "—", "–", "-", "n/a", "N/A"]);
/** Summary rows stay under the sorted rows. */
const PINNED = /^(career|totals?|average|avg)\b/i;
const SEASON = /^\d{4}-\d{2}\b/;
const SCALE: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };

const sorts = new WeakMap<HTMLTableElement, SortState>();
const observed = new WeakSet<HTMLTableElement>();
const firstOrder = new WeakMap<HTMLTableRowElement, number>();
let orderSeq = 0;

/** Header cells placed on the column grid (rowSpan and colSpan honored), with a key per column. */
function headerGrid(table: HTMLTableElement) {
  const slots: HTMLTableCellElement[][] = [];
  const rows = table.tHead ? [...table.tHead.rows] : [];
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row.cells) {
      while (slots[r]?.[c]) c++;
      const rowSpan = Math.max(1, cell.rowSpan);
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < cell.colSpan; dc++) (slots[r + dr] ??= [])[c + dc] = cell;
      }
      c += cell.colSpan;
    }
  });
  const columnOf = new Map<HTMLTableCellElement, number>();
  const keys: string[] = [];
  const width = Math.max(0, ...slots.map((row) => row.length));
  for (let c = 0; c < width; c++) {
    const stack = [...new Set(slots.map((row) => row[c]).filter(Boolean))];
    keys[c] = stack.map((cell) => cell.textContent?.trim() ?? "").join(" / ");
    const leaf = stack.at(-1);
    if (leaf && leaf.colSpan === 1 && !columnOf.has(leaf)) columnOf.set(leaf, c);
  }
  return { columnOf, keys };
}

/** A body row's cell at grid column `col`, or null when a merged cell covers it. */
function cellAt(row: HTMLTableRowElement, col: number): HTMLTableCellElement | null {
  let c = 0;
  for (const cell of row.cells) {
    if (col < c + cell.colSpan) return cell.colSpan === 1 ? cell : null;
    c += cell.colSpan;
  }
  return null;
}

function readValue(cell: HTMLTableCellElement | null): Value {
  if (!cell) return null;
  const raw = (cell.dataset.sortValue ?? cell.textContent ?? "").replace(/\s+/g, " ").trim();
  if (MISSING.has(raw)) return null;
  const plain = raw.replace(/[−]/g, "-").replace(/[$,%+]/g, "");
  const num = /^(-?\d*\.?\d+)\s*([kmb])?$/i.exec(plain);
  if (num) return parseFloat(num[1]) * (num[2] ? SCALE[num[2].toLowerCase()] : 1);
  const ordinal = /^(\d+)(st|nd|rd|th)$/i.exec(raw);
  if (ordinal) return Number(ordinal[1]);
  return raw;
}

function kindOf(values: Value[]): Kind {
  const present = values.filter((v) => v != null);
  if (!present.length) return "text";
  if (present.filter((v) => typeof v === "number").length * 2 >= present.length) return "number";
  if (present.every((v) => typeof v === "string" && SEASON.test(v))) return "season";
  return "text";
}

/** Rows that can move: a merged body cell means rows belong together, so leave the table alone. */
function sortableRows(body: HTMLTableSectionElement) {
  const rows = [...body.rows];
  const movable: HTMLTableRowElement[] = [];
  const pinned: HTMLTableRowElement[] = [];
  for (const row of rows) {
    if (!firstOrder.has(row)) firstOrder.set(row, orderSeq++);
    const label = row.cells[0]?.textContent?.trim() ?? "";
    if (PINNED.test(label)) pinned.push(row);
    else if ([...row.cells].some((cell) => cell.colSpan > 1 || cell.rowSpan > 1)) return null;
    else movable.push(row);
  }
  return { rows, movable, pinned };
}

function columnValues(table: HTMLTableElement, col: number): Value[] {
  return [...table.tBodies].flatMap((body) => [...body.rows].map((row) => readValue(cellAt(row, col))));
}

function applySort(table: HTMLTableElement) {
  const state = sorts.get(table);
  if (!state) return;
  const { columnOf, keys } = headerGrid(table);
  const col = keys.indexOf(state.key);
  for (const [cell, c] of columnOf) {
    if (c === col) cell.setAttribute("aria-sort", state.dir === "asc" ? "ascending" : "descending");
    else cell.removeAttribute("aria-sort");
  }
  const kind = col >= 0 ? kindOf(columnValues(table, col)) : "text";
  for (const body of table.tBodies) {
    const found = sortableRows(body);
    if (!found) continue;
    const ranked = found.movable.map((row) => ({
      row,
      value: col >= 0 ? readValue(cellAt(row, col)) : null,
      order: firstOrder.get(row) ?? 0,
    }));
    ranked.sort((a, b) => {
      if (col < 0) return a.order - b.order;
      const aMissing = a.value == null || (kind === "number" && typeof a.value !== "number");
      const bMissing = b.value == null || (kind === "number" && typeof b.value !== "number");
      if (aMissing || bMissing) return aMissing === bMissing ? a.order - b.order : aMissing ? 1 : -1;
      const diff =
        kind === "number"
          ? (a.value as number) - (b.value as number)
          : String(a.value).localeCompare(String(b.value), undefined, { numeric: true });
      return (state.dir === "asc" ? diff : -diff) || a.order - b.order;
    });
    const next = [...ranked.map((r) => r.row), ...found.pinned];
    if (next.every((row, i) => found.rows[i] === row)) continue;
    body.append(...next);
  }
}

/** React may re-render a sorted table (rate toggles, new columns); sort it again once it settles. */
function watch(table: HTMLTableElement) {
  if (observed.has(table)) return;
  observed.add(table);
  let frame = 0;
  new MutationObserver(() => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      applySort(table);
    });
  }).observe(table, { childList: true, subtree: true, characterData: true });
}

/**
 * Click any column header in a table under `[data-sortable-tables]` to sort
 * its rows: highest first, then lowest first. Blank values stay at the bottom
 * either way, and summary rows such as Career stay last. Tables that already
 * sort themselves (their headers carry aria-sort from React) are left alone.
 * Nothing is touched until a click, so server HTML still hydrates cleanly.
 */
export function SortableTables() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const th = target?.closest("th");
      if (!th || !th.closest(SCOPE)) return;
      const control = target?.closest(INTERACTIVE);
      if (control && th.contains(control)) return;
      const table = th.closest("table");
      if (!table?.tHead?.contains(th)) return;
      if (!sorts.has(table) && table.tHead.querySelector("[aria-sort]")) return;
      const { columnOf, keys } = headerGrid(table);
      const col = columnOf.get(th as HTMLTableCellElement);
      if (col == null) return;
      const key = keys[col];
      const prev = sorts.get(table);
      const kind = kindOf(columnValues(table, col));
      const dir: Dir = prev?.key === key ? (prev.dir === "desc" ? "asc" : "desc") : kind === "text" ? "asc" : "desc";
      sorts.set(table, { key, dir });
      applySort(table);
      watch(table);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
