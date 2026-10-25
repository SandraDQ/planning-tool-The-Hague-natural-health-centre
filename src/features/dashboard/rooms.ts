/** "Room 3" or "Room 3 · Garden room": skips a name that only repeats the number. */
export function roomTitle(number: number, name: string, numberLabel: string) {
  const n = name.trim();
  if (!n || /^(kamer|room)\s*\d+$/i.test(n) || n === String(number)) return numberLabel;
  return `${numberLabel} · ${n}`;
}

/** The room's own name, unless it only repeats the number. */
export function roomExtraName(number: number, name: string) {
  const n = name.trim();
  return !n || /^(kamer|room)\s*\d+$/i.test(n) || n === String(number) ? "" : n;
}
