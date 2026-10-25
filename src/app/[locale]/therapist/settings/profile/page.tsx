import { getTranslations, setRequestLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage } from "@/features/dashboard/components/Page";
import { SettingsHeader } from "@/features/dashboard/therapist/SettingsHeader";
import { ProfileEditor } from "@/features/dashboard/therapist/ProfileEditor";

export default async function TherapistProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("therapist", locale);
  const t = await getTranslations("therapist.settings");
  const me = await getStore().therapist.getMe(session);
  return (
    <DashboardPage narrow>
      <SettingsHeader title={t("profile")} description={t("profileLead")} />
      <ProfileEditor me={me} />
    </DashboardPage>
  );
}
