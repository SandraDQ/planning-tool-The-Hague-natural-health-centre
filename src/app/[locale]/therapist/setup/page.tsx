import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/server/session";
import { DashboardPage, PageHeading } from "@/features/dashboard/components/Page";
import { SetupChecklist } from "@/features/onboarding/SetupChecklist";
import { therapistSetup } from "@/features/onboarding/setup";

/** Step-by-step setup for a new therapist (8B). Every step links to the screen where it's done. */
export default async function TherapistSetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("therapist", locale);
  const t = await getTranslations("setup");
  const { steps, done, total } = await therapistSetup(session);
  return (
    <DashboardPage narrow>
      <PageHeading title={t("title")} description={t("lead")} />
      <div className="mt-6">
        <SetupChecklist steps={steps} done={done} total={total} />
      </div>
    </DashboardPage>
  );
}
