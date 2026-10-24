import { WeekGameCalendarLoader } from "@/components/home/week-game-calendar-loader";

/** Horizontal week strip — games load client-side so glass cards stay out of first HTML. */
export function WeekGameCalendar({ season }: { season: string }) {
  return <WeekGameCalendarLoader season={season} />;
}
