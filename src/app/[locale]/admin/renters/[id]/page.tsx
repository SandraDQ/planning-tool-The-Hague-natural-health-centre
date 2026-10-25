import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ButtonLink, Icons } from "@/design-system";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage, PageHeading } from "@/features/dashboard/components/Page";
import { RenterEditor } from "@/features/dashboard/admin/RenterEditor";

export default async function AdminRenterPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const session = await requireRole("admin", locale);
  const t = await getTranslations("admin.renter");
  const store = getStore().admin;
  const [therapists, therapies] = await Promise.all([store.listTherapists(session), store.listTherapies(session)]);
  const therapist = therapists.find((x) => x.id === id);
  if (!therapist) notFound();
  const business = await store.getBusiness(session, id);

  return (
    <DashboardPage>
      <ButtonLink href="/admin/renters" variant="ghost" size="sm" leadingIcon={<Icons.ChevronLeft />} className="-ml-3 mb-2">
        {t("back")}
      </ButtonLink>
      <PageHeading
        eyebrow={t(`onboarding.${therapist.onboardingStatus}`)}
        title={therapist.displayName}
        description={t("lead")}
      />
      <RenterEditor therapist={therapist} therapies={therapies} business={business} />
    </DashboardPage>
  );
}
