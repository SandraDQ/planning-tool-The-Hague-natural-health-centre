import { setRequestLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage } from "@/features/dashboard/components/Page";
import { BlocksManager } from "@/features/dashboard/therapist/BlocksManager";
import { addDays, localToIso, todayLocal } from "@/features/dashboard/time";

// The store accepts ranges up to 62 days.
const WEEKS_AHEAD = 8;

export default async function TherapistBlocksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("therapist", locale);
  const store = getStore().therapist;
  const today = todayLocal();
  const range = { start: localToIso(today, "00:00"), end: localToIso(addDays(today, WEEKS_AHEAD * 7), "00:00") };
  const [me, blocks, rooms, templates, taken, services, sessionTypes, appointments] = await Promise.all([
    store.getMe(session),
    store.listMyBlocks(session, range),
    store.listRooms(session),
    store.listBlockTemplates(session),
    store.listTakenBlocks(session, range),
    store.listMyServices(session),
    store.listMySessionTypes(session),
    store.listMyAppointments(session, range),
  ]);
  const live = appointments.filter((a) => a.status === "held" || a.status === "confirmed");
  const reserved = blocks.filter((b) => b.status === "reserved").sort((a, b) => a.period.start.localeCompare(b.period.start));
  const counts: Record<string, number> = {};
  for (const b of reserved) {
    counts[b.id] = live.filter((a) => a.roomBlockId === b.id || (a.roomId === b.roomId && a.session.start < b.period.end && a.session.end > b.period.start)).length;
  }

  return (
    <DashboardPage>
      <BlocksManager
        blocks={reserved}
        counts={counts}
        rooms={rooms}
        templates={templates.filter((x) => x.active).sort((a, b) => a.startTime.localeCompare(b.startTime))}
        taken={taken}
        takenRange={range}
        services={services}
        sessionTypes={sessionTypes}
        bufferMinutes={me.bufferMinutes}
        today={today}
      />
    </DashboardPage>
  );
}
