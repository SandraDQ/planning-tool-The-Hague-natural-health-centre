import { setRequestLocale } from "next-intl/server";
import { TherapistCalendar } from "./TherapistCalendar";

export default async function TherapistCalendarMockPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TherapistCalendar />;
}
