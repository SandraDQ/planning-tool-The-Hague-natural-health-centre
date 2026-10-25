import "server-only";

// Demo-mode singleton (D21). Module-level state survives across requests in one
// server process and resets on restart/redeploy. Kept on globalThis so Next.js
// dev hot reloads do not wipe it.

import type { Session } from "@/lib/domain/types";
import type { AppStore } from "../extensions";
import { DEMO_IDS, createSeedState } from "./seed";
import type { DemoState } from "./state";
import { createDemoStore } from "./store";

interface DemoRuntime {
  state: DemoState;
  store: AppStore;
}

const KEY = Symbol.for("thnhc.demo.runtime");
type WithRuntime = typeof globalThis & { [KEY]?: DemoRuntime };

function runtime(): DemoRuntime {
  const g = globalThis as WithRuntime;
  if (!g[KEY]) {
    const state = createSeedState(new Date());
    g[KEY] = { state, store: createDemoStore(state) };
  }
  return g[KEY]!;
}

export function getDemoStore(): AppStore {
  return runtime().store;
}

/** Throws away all demo changes and seeds fresh data relative to now. */
export function resetDemoStore(): void {
  delete (globalThis as WithRuntime)[KEY];
}

export interface DemoAccount {
  /** Opaque id stored in the signed cookie. */
  id: string;
  session: Session;
  /** Short description for the sign-in page (therapies, room), NL/EN agnostic data. */
  kind: "admin" | "therapist" | "client";
  therapyIds: string[];
  roomNumbers: number[];
  paperCalendar: boolean;
  onboarding: "invited" | "in_progress" | "complete" | null;
}

/** Everyone a demo viewer can sign in as: the owner (admin), each therapist, the demo client. */
export function listDemoAccounts(): DemoAccount[] {
  const { state } = runtime();
  const admin: DemoAccount = {
    id: "admin",
    kind: "admin",
    session: { role: "admin", userId: DEMO_IDS.admin, displayName: "Demo – Eigenaar / Owner" },
    therapyIds: [],
    roomNumbers: [],
    paperCalendar: false,
    onboarding: null,
  };
  const therapists: DemoAccount[] = state.therapists.map((t) => {
    const rooms = new Set<number>();
    for (const r of state.rooms) if (r.privateTherapistId === t.id) rooms.add(r.number);
    for (const s of state.blockSeries) {
      if (s.therapistId === t.id) {
        const r = state.rooms.find((x) => x.id === s.roomId);
        if (r) rooms.add(r.number);
      }
    }
    return {
      id: `therapist:${t.id}`,
      kind: "therapist",
      session: { role: "therapist", userId: `user-${t.id}`, therapistId: t.id, displayName: t.displayName },
      therapyIds: t.therapyIds,
      roomNumbers: [...rooms].sort((a, b) => a - b),
      paperCalendar: t.paperCalendar,
      onboarding: t.onboardingStatus,
    };
  });
  const lotte = state.clients.find((c) => c.id === DEMO_IDS.clientLotte);
  const clients: DemoAccount[] = lotte
    ? [
        {
          id: `client:${lotte.id}`,
          kind: "client",
          session: { role: "client", userId: `user-${lotte.id}`, clientId: lotte.id, displayName: `Demo – ${lotte.firstName} ${lotte.lastName}` },
          therapyIds: [],
          roomNumbers: [],
          paperCalendar: false,
          onboarding: null,
        },
      ]
    : [];
  return [admin, ...therapists, ...clients];
}

export function findDemoAccount(id: string): DemoAccount | null {
  return listDemoAccounts().find((a) => a.id === id) ?? null;
}

export { DEMO_IDS };
