// Weekly block series → concrete room blocks (D3, like materialize_block_series()).

import type { BlockSeries, RoomBlock } from "@/lib/domain/types";
import { expandBlockSeries } from "@/lib/scheduling";
import { blockConflicts } from "./rules";
import type { DemoState } from "./state";
import { addDays, localToUtcIso } from "./time";

/** How far ahead weekly series are turned into blocks. */
export const SERIES_HORIZON_WEEKS = 8;

/**
 * Creates the missing blocks of a series from its start up to `until` (local date, inclusive).
 * Safe to run again: occurrences that already exist (also when released as an exception)
 * are skipped by the engine; occurrences that collide with another block are skipped here.
 */
export function materializeSeries(state: DemoState, series: BlockSeries, until: string): RoomBlock[] {
  const range = { start: localToUtcIso(series.startsOn, "00:00"), end: localToUtcIso(addDays(until, 1), "00:00") };
  const created: RoomBlock[] = [];
  for (const block of expandBlockSeries(series, state.blockTemplates, range, { existing: state.blocks })) {
    if (state.blocks.some((b) => b.id === block.id) || blockConflicts(state, block.roomId, block.period)) continue;
    state.blocks.push(block);
    created.push(block);
  }
  return created;
}
