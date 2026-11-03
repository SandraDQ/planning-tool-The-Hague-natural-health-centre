import { getTranslations, setRequestLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage } from "@/features/dashboard/components/Page";
import { SettingsHeader } from "@/features/dashboard/therapist/SettingsHeader";
import { ConfirmationMessageEditor } from "@/features/email/ConfirmationMessageEditor";
import { Welcome } from "@/features/email/Welcome";

export default async function TherapistEmailsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("therapist", locale);
  const t = await getTranslations("email.therapist");
  const store = getStore();
  const [me, services, templates, centre] = await Promise.all([
    store.therapist.getMe(session),
    store.therapist.listMyServices(session),
    store.email.listMyTemplates(session),
    store.email.getCentreSettings(session),
  ]);
  return (
    <DashboardPage narrow>
      <SettingsHeader title={t("settingsTitle")} description={t("lead")} />
      <Welcome title={t("welcomeTitle")} lines={[t("welcome1"), t("welcome2"), t("welcome3")]} />
      <ConfirmationMessageEditor
        therapistName={me.displayName}
        publicEmail={me.publicEmail}
        services={services.filter((s) => !s.archived).map((s) => ({ id: s.id, name: s.name }))}
        templates={templates}
        centre={centre}
      />
    </DashboardPage>
  );
}
