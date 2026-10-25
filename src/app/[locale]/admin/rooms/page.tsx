import { getTranslations, setRequestLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage, PageHeading } from "@/features/dashboard/components/Page";
import { RoomsManager } from "@/features/dashboard/admin/RoomsManager";

export default async function AdminRoomsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("admin", locale);
  const t = await getTranslations("admin.rooms");
  const store = getStore().admin;
  const [rooms, templates, therapists] = await Promise.all([
    store.listRooms(session),
    store.listBlockTemplates(session),
    store.listTherapists(session),
  ]);
  return (
    <DashboardPage>
      <PageHeading title={t("title")} description={t("lead")} />
      <RoomsManager rooms={rooms} templates={templates} therapists={therapists} />
    </DashboardPage>
  );
}
