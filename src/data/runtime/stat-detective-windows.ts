import snapshot from "./stat-detective-windows.json";

import {
  STAT_DETECTIVE_METRICS,
  STAT_WINDOWS,
  isStatDetectiveMetricId,
  type StatDetectiveMetricId,
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
  windowTs?: number | null;
  baselineTs?: number | null;
  deltaTs: number | null;
  windowRpg?: number | null;
  baselineRpg?: number | null;
  deltaRpg?: number | null;
};

export type StatDetectiveWindow = {
  id: StatWindowId;
  label: string;
  question: string;
  note: string;
  baselineLabel: string;
  windowLabel: string;
  metric: StatDetectiveMetricId;
  risers: StatDetectiveRow[];
  fallers: StatDetectiveRow[];
};

type SnapshotBoard = {
  risers?: StatDetectiveRow[];
  fallers?: StatDetectiveRow[];
};

type SnapshotWindow = SnapshotBoard & {
  metrics?: Partial<Record<StatDetectiveMetricId, SnapshotBoard>>;
};

type SnapshotFile = {
  generatedAt?: string;
  season?: string;
  source?: string;
  windows?: Partial<Record<StatWindowId, SnapshotWindow>>;
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

function boardFor(
  windowId: StatWindowId,
  metric: StatDetectiveMetricId
): SnapshotBoard {
  const block = data.windows?.[windowId];
  if (!block) return { risers: [], fallers: [] };
  const nested = block.metrics?.[metric];
  if (nested) return nested;
  // Legacy bake: only PPG boards at the top level.
  if (metric === "ppg") return block;
  return { risers: [], fallers: [] };
}

export function statDetectiveWindows(
  metric: StatDetectiveMetricId = "ppg"
): StatDetectiveWindow[] {
  return WINDOW_IDS.map((id) => {
    const board = boardFor(id, metric);
    return {
      id,
      label: STAT_WINDOWS[id].label,
      question: STAT_WINDOWS[id].question,
      note: STAT_WINDOWS[id].note,
      baselineLabel: STAT_WINDOWS[id].baselineLabel,
      windowLabel: STAT_WINDOWS[id].windowLabel,
      metric,
      risers: rows(board.risers),
      fallers: rows(board.fallers),
    };
  });
}

export function statDetectiveWindow(
  id: StatWindowId,
  metric: StatDetectiveMetricId = "ppg"
): StatDetectiveWindow {
  return (
    statDetectiveWindows(metric).find((window) => window.id === id) ??
    statDetectiveWindows(metric)[0]
  );
}

export function isStatWindowId(value: string | undefined): value is StatWindowId {
  return value === "last5" || value === "last10" || value === "split5";
}

export { isStatDetectiveMetricId, STAT_DETECTIVE_METRICS };
export type { StatDetectiveMetricId };
