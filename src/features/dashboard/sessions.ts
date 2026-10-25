// "N sessions fit in this block" preview for therapists (MASTER_PROMPT 3.3).
// Uses the scheduling engine, so the number matches what clients can book online
// (sessions packed on the 15-minute grid, each followed by the buffer).
import { sessionsThatFit } from "@/lib/scheduling";

export function sessionsInBlock(blockMinutes: number, durationMin: number, bufferMinutes: number): number {
  return sessionsThatFit({ blockMinutes, durationMin, bufferMinutes });
}
