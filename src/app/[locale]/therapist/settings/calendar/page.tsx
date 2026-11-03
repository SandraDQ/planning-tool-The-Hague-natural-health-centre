import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/server/session";
import { DashboardPage } from "@/features/dashboard/components/Page";
import { SettingsHeader } from "@/features/dashboard/therapist/SettingsHeader";
import { CalendarFeedPanel } from "@/features/calendar-feed/CalendarFeedPanel";

export default async function TherapistCalendarLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ link?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("therapist", locale);
  const t = await getTranslations("therapist.settings");
  return (
    <DashboardPage narrow>
      <SettingsHeader title={t("calendarLink")} description={t("calendarLinkLead")} />
      <CalendarFeedPanel session={session} status={(await searchParams).link} />
    </DashboardPage>
  );
}
