import { getHistoricalTeams } from "@/data/queries";
import { jsonError, jsonOk } from "@/app/api/_lib/http";

export async function GET() {
  try {
    const teams = await getHistoricalTeams();
    return jsonOk({ count: teams.length, data: teams });
  } catch (error) {
    return jsonError(error);
  }
}
