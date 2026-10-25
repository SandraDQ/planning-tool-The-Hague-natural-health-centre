import { setRequestLocale } from "next-intl/server";
import { getStore } from "@/lib/server/data";
import { requireRole } from "@/lib/server/session";
import { DashboardPage } from "@/features/dashboard/components/Page";
import { PaperWindowsManager } from "@/features/dashboard/admin/PaperWindowsManager";
import { addDays, localToIso, todayLocal } from "@/features/dashboard/time";

/** How far ahead the "open a window" sheet offers the therapist's blocks (the demo store caps ranges at 62 days). */
const DAYS_AHEAD = 56;

export default async function AdminPaperPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("admin", locale);
  const store = getStore().admin;
  const today = todayLocal();
  const range = { start: localToIso(today, "00:00"), end: localToIso(addDays(today, DAYS_AHEAD), "00:00") };
  const [windows, therapists, rooms, grid] = await Promise.all([
    store.listPaperWindows(session),
    store.listTherapists(session),
    store.listRooms(session),
    store.roomGrid(session, range),
  ]);
  const now = new Date().toISOString();

  // Bookings per window, as far as the grid range reaches; used to explain why a window can't be closed.
  const booked: Record<string, number> = {};
  for (const a of grid.appointments) {
    if (a.paperWindowId && (a.status === "held" || a.status === "confirmed")) booked[a.paperWindowId] = (booked[a.paperWindowId] ?? 0) + 1;
  }

  return (
    <DashboardPage>
      <PaperWindowsManager
        now={now}
        today={today}
        windows={windows.filter((w) => w.period.end > now)}
        therapists={therapists}
        rooms={rooms}
        blocks={grid.blocks.filter((b) => b.status === "reserved" && b.period.end > now)}
        booked={booked}
      />
    </DashboardPage>
  );
}
