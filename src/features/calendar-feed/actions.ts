"use server";

import { redirect } from "@/i18n/navigation";
import { getStore } from "@/lib/server/data";
import { logSafeError } from "@/lib/server/errors";
import { getSession } from "@/lib/server/session";

/** Makes the viewer's old calendar link stop working and shows the new one. */
export async function resetCalendarLink(form: FormData): Promise<void> {
  const locale = form.get("locale") === "en" ? "en" : "nl";
  const session = await getSession();
  const back = session?.role === "admin" ? "/admin/grid" : "/therapist/settings/calendar";
  const anchor = session?.role === "admin" ? "#calendar-link" : "";
  let status = "reset";
  try {
    if (!session) throw Object.assign(new Error("forbidden"), { code: "forbidden" });
    await getStore().feeds.resetMine(session);
  } catch (err) {
    logSafeError("[calendar-feed] reset failed", err);
    status = "error";
  }
  redirect({ href: `${back}?link=${status}${anchor}`, locale });
}
