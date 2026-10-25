// Rent estimate per renter for one month (D12). An estimate only: the real
// monthly rent run (9.4) is built later by the invoicing agent.

import type { Id, RentRate, Room, RoomBlock, Therapist } from "@/lib/domain/types";
import { BTW_RATE } from "./money";
import { localDay } from "./time";

export function rateOn(rates: RentRate[], roomId: Id | null, day: string): RentRate | null {
  const valid = rates
    .filter((r) => r.roomId === roomId && r.validFrom <= day && (r.validTo == null || r.validTo >= day))
    .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
  return valid[0] ?? null;
}

export type RentLine = {
  roomId: Id;
  mode: "fixed_monthly" | "per_block";
  blocks: number;
  netCents: number;
  btwCents: number;
  /** True when the default shared-room rate was used. */
  usesDefault: boolean;
};

export type RentEstimate = {
  therapistId: Id;
  lines: RentLine[];
  netCents: number;
  btwCents: number;
  /** Blocks that had no rate to price them. */
  unpriced: number;
};

export function estimateMonthlyRent({
  therapists,
  rooms,
  rates,
  blocks,
  monthFirstDay,
}: {
  therapists: Therapist[];
  rooms: Room[];
  rates: RentRate[];
  blocks: RoomBlock[];
  monthFirstDay: string;
}): RentEstimate[] {
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  return therapists.map((t) => {
    const lines = new Map<string, RentLine>();
    let unpriced = 0;
    const add = (key: string, init: RentLine, net: number, btw: number) => {
      const line = lines.get(key) ?? init;
      line.netCents += net;
      line.btwCents += btw;
      if (init.mode === "per_block") line.blocks += 1;
      lines.set(key, line);
    };

    // Fixed monthly rent for rooms assigned to this therapist.
    for (const room of rooms) {
      if (room.privateTherapistId !== t.id || !room.active) continue;
      const rate = rateOn(rates, room.id, monthFirstDay);
      if (rate?.pricingMode === "fixed_monthly") {
        add(`${room.id}:fixed`, { roomId: room.id, mode: "fixed_monthly", blocks: 0, netCents: 0, btwCents: 0, usesDefault: false }, rate.amountCents, Math.round(rate.amountCents * BTW_RATE[rate.btwTreatment]));
      }
    }

    // Per-block rent for reserved blocks.
    for (const block of blocks) {
      if (block.therapistId !== t.id || block.status !== "reserved") continue;
      const room = roomById.get(block.roomId);
      if (!room) continue;
      const day = localDay(block.period.start);
      const own = rateOn(rates, room.id, day);
      if (own?.pricingMode === "fixed_monthly") continue; // covered by the monthly amount
      const rate = own ?? (room.kind === "shared" ? rateOn(rates, null, day) : null);
      if (!rate) {
        unpriced += 1;
        continue;
      }
      add(`${room.id}:block`, { roomId: room.id, mode: "per_block", blocks: 0, netCents: 0, btwCents: 0, usesDefault: !own }, rate.amountCents, Math.round(rate.amountCents * BTW_RATE[rate.btwTreatment]));
    }

    const all = [...lines.values()];
    return {
      therapistId: t.id,
      lines: all,
      netCents: all.reduce((n, l) => n + l.netCents, 0),
      btwCents: all.reduce((n, l) => n + l.btwCents, 0),
      unpriced,
    };
  });
}
