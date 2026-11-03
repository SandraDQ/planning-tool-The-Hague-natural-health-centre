import "server-only";
import type { Session } from "@/lib/domain/types";
import { getStore } from "@/lib/server/data";

export type SetupStepId = "profile" | "services" | "times" | "policy" | "payments" | "preview";

export interface SetupStep {
  id: SetupStepId;
  done: boolean;
  /** Where to do it; null when it can't be done yet. */
  href: string | null;
  /** Needed before clients can book (8B); the others help but are optional. */
  essential: boolean;
  /** Not available yet (online payments come with Mollie). */
  later?: boolean;
}

const DAY = 86_400_000;

/** The therapist's setup checklist (8B), worked out from what they have already filled in. */
export async function therapistSetup(session: Session): Promise<{ steps: SetupStep[]; done: number; total: number; slug: string }> {
  const store = getStore().therapist;
  const now = Date.now();
  const [me, services, sessionTypes, rooms, availability, blocks, policy] = await Promise.all([
    store.getMe(session),
    store.listMyServices(session),
    store.listMySessionTypes(session),
    store.listRooms(session),
    store.listAvailability(session),
    store.listMyBlocks(session, { start: new Date(now).toISOString(), end: new Date(now + 56 * DAY).toISOString() }),
    store.getMyPolicy(session),
  ]);
  const hasPrivateRoom = rooms.some((r) => r.privateTherapistId === me.id);
  const liveServices = new Set(services.filter((s) => !s.archived).map((s) => s.id));
  const steps: SetupStep[] = [
    { id: "profile", essential: false, href: "/therapist/settings/profile", done: Boolean(me.bio.nl.trim() && me.bio.en.trim()) },
    { id: "services", essential: true, href: "/therapist/settings/services", done: sessionTypes.some((st) => liveServices.has(st.serviceId)) },
    {
      id: "times",
      essential: true,
      href: hasPrivateRoom ? "/therapist/settings/availability" : "/therapist/blocks",
      done: hasPrivateRoom ? availability.length > 0 : blocks.some((b) => b.status === "reserved"),
    },
    { id: "policy", essential: true, href: "/therapist/settings/policy", done: policy !== null },
    { id: "payments", essential: true, href: null, done: false, later: true },
    { id: "preview", essential: false, href: `/book/therapist/${encodeURIComponent(me.slug)}`, done: false },
  ];
  const counted = steps.filter((s) => !s.later && s.id !== "preview");
  return { steps, done: counted.filter((s) => s.done).length, total: counted.length, slug: me.slug };
}
