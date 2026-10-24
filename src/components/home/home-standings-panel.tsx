import { HomeStandingsClient } from "@/components/home/home-standings-client";

/** Homepage standings — table loads client-side (see HomeStandingsClient). */
export function HomeStandingsPanel({
  season,
  race = false,
}: {
  season: string;
  race?: boolean;
}) {
  return <HomeStandingsClient season={season} race={race} />;
}
