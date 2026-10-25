import { getTranslations, setRequestLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage } from "@/features/dashboard/components/Page";
import { SettingsHeader } from "@/features/dashboard/therapist/SettingsHeader";
import { ServicesManager } from "@/features/dashboard/therapist/ServicesManager";

export default async function TherapistServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("therapist", locale);
  const t = await getTranslations("therapist.services");
  const store = getStore();
  const [me, services, sessionTypes, therapies] = await Promise.all([
    store.therapist.getMe(session),
    store.therapist.listMyServices(session),
    store.therapist.listMySessionTypes(session),
    store.public.listTherapies(),
  ]);
  const mine = therapies.filter((x) => me.therapyIds.includes(x.id) || services.some((s) => s.therapyId === x.id));
  return (
    <DashboardPage narrow>
      <SettingsHeader title={t("title")} description={t("lead")} />
      <ServicesManager services={services} sessionTypes={sessionTypes} therapies={mine.length ? mine : therapies} />
    </DashboardPage>
  );
}
