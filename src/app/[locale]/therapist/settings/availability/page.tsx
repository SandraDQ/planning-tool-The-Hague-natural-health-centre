import { getTranslations, setRequestLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage } from "@/features/dashboard/components/Page";
import { SettingsHeader } from "@/features/dashboard/therapist/SettingsHeader";
import { AvailabilityEditor } from "@/features/dashboard/therapist/AvailabilityEditor";
import { todayLocal } from "@/features/dashboard/time";

export default async function TherapistAvailabilityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("therapist", locale);
  const t = await getTranslations("therapist.availability");
  const store = getStore().therapist;
  const [me, rules, timeOff, rooms] = await Promise.all([
    store.getMe(session),
    store.listAvailability(session),
    store.listMyTimeOff(session),
    store.listRooms(session),
  ]);
  return (
    <DashboardPage narrow>
      <SettingsHeader title={t("title")} description={t("lead")} />
      <AvailabilityEditor
        rules={rules}
        bufferMinutes={me.bufferMinutes}
        timeOff={timeOff}
        hasPrivateRoom={rooms.some((r) => r.kind === "private" && r.privateTherapistId === me.id)}
        today={todayLocal()}
      />
    </DashboardPage>
  );
}
