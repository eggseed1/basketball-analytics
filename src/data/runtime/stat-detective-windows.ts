import snapshot from "./stat-detective-windows.json";

import {
  STAT_WINDOWS,
  type StatWindowId,
} from "@/analytics/stat-detective-windows";

export type StatDetectiveRow = {
  playerId: string;
  playerName: string;
  teamAbbr: string;
  windowPpg: number;
  baselinePpg: number;
  deltaPpg: number;
  windowMpg: number;
  baselineMpg: number;
  deltaTs: number | null;
};

export type StatDetectiveWindow = {
  id: StatWindowId;
  label: string;
  question: string;
  note: string;
  baselineLabel: string;
  windowLabel: string;
  risers: StatDetectiveRow[];
  fallers: StatDetectiveRow[];
};

type SnapshotFile = {
  generatedAt?: string;
  season?: string;
  source?: string;
  windows?: Partial<
    Record<StatWindowId, { risers?: StatDetectiveRow[]; fallers?: StatDetectiveRow[] }>
  >;
};

const data = snapshot as SnapshotFile;
const WINDOW_IDS: StatWindowId[] = ["last5", "last10", "split5"];

function rows(value: StatDetectiveRow[] | undefined): StatDetectiveRow[] {
  return Array.isArray(value) ? value : [];
}

export function statDetectiveSeason(): string | null {
  const season = data.season?.trim();
  return season || null;
}

export function statDetectiveWindows(): StatDetectiveWindow[] {
  return WINDOW_IDS.map((id) => ({
    id,
    label: STAT_WINDOWS[id].label,
    question: STAT_WINDOWS[id].question,
    note: STAT_WINDOWS[id].note,
    baselineLabel: STAT_WINDOWS[id].baselineLabel,
    windowLabel: STAT_WINDOWS[id].windowLabel,
    risers: rows(data.windows?.[id]?.risers),
    fallers: rows(data.windows?.[id]?.fallers),
  }));
}

export function statDetectiveWindow(id: StatWindowId): StatDetectiveWindow {
  return (
    statDetectiveWindows().find((window) => window.id === id) ??
    statDetectiveWindows()[0]
  );
}

export function isStatWindowId(value: string | undefined): value is StatWindowId {
  return value === "last5" || value === "last10" || value === "split5";
}
