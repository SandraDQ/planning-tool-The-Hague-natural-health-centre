import { setRequestLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage } from "@/features/dashboard/components/Page";
import { TherapiesManager } from "@/features/dashboard/admin/TherapiesManager";

export default async function AdminTherapiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("admin", locale);
  const store = getStore().admin;
  const [therapies, therapists] = await Promise.all([store.listTherapies(session), store.listTherapists(session)]);
  return (
    <DashboardPage narrow>
      <TherapiesManager therapies={therapies} therapists={therapists} />
    </DashboardPage>
  );
}
