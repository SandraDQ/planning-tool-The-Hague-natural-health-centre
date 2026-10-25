import { getTranslations, setRequestLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage } from "@/features/dashboard/components/Page";
import { SettingsHeader } from "@/features/dashboard/therapist/SettingsHeader";
import { PolicyEditor } from "@/features/dashboard/therapist/PolicyEditor";

export default async function TherapistPolicyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("therapist", locale);
  const t = await getTranslations("therapist.settings");
  const store = getStore().therapist;
  const [me, policy] = await Promise.all([store.getMe(session), store.getMyPolicy(session)]);
  return (
    <DashboardPage narrow>
      <SettingsHeader title={t("policy")} description={t("policyLead")} />
      <PolicyEditor policy={policy} me={me} />
    </DashboardPage>
  );
}
