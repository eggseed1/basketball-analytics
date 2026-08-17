/**
 * Diagnostic query surface for advanced-stats source audit.
 * Not used by player pages / explore / ASK.
 */

import {
  buildAdvancedStatsCoverageReport,
  type BuildAdvancedCoverageOptions,
} from "@/data/providers/advanced-stats/coverage";
import type { AdvancedStatsCoverageReport } from "@/data/types/advanced-season-stats";

export async function getAdvancedStatsCoverage(
  options: BuildAdvancedCoverageOptions = {}
): Promise<AdvancedStatsCoverageReport> {
  return buildAdvancedStatsCoverageReport(options);
}
