import { setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/server/session";
import { loadCalendarData } from "@/features/dashboard/therapist/calendar-data";
import { TherapistCalendar } from "@/features/dashboard/therapist/TherapistCalendar";
import { mondayOf, parseDayParam, todayLocal } from "@/features/dashboard/time";

export default async function TherapistCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string; day?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("therapist", locale);
  const query = await searchParams;
  const today = todayLocal();
  const day = parseDayParam(query.day) ?? parseDayParam(query.week) ?? today;
  const monday = mondayOf(parseDayParam(query.week) ?? day);
  const data = await loadCalendarData(session, monday);
  return <TherapistCalendar key={monday} data={data} initialDay={day} today={today} />;
}
