/** A local calendar date "YYYY-MM-DD" as a Date at noon UTC, so formatting in Europe/Amsterdam never shifts the day. */
export function dayToDate(day: string) {
  return new Date(`${day}T12:00:00Z`);
}
