import { setRequestLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage } from "@/features/dashboard/components/Page";
import { RentersList } from "@/features/dashboard/admin/RentersList";

export default async function AdminRentersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("admin", locale);
  const store = getStore().admin;
  const [therapists, therapies, rooms] = await Promise.all([
    store.listTherapists(session),
    store.listTherapies(session),
    store.listRooms(session),
  ]);
  return (
    <DashboardPage>
      <RentersList therapists={therapists} therapies={therapies} rooms={rooms} />
    </DashboardPage>
  );
}
