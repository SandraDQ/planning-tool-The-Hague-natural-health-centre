import "server-only";
import { cookies } from "next/headers";
import type { Appointment, Id } from "@/lib/domain/types";
import { getSession } from "@/lib/server/session";

// The payment and confirmation pages are only shown to the browser that made the
// hold (or to the signed-in client it belongs to). The cookie holds appointment ids
// only, never personal data.
const COOKIE = "thnhc_bookings";
const MAX = 10;

async function readIds(): Promise<Id[]> {
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  return raw.split(",").filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s));
}

/** Server actions only (cookies are read-only while rendering). */
export async function rememberBooking(id: Id) {
  const ids = [id, ...(await readIds()).filter((x) => x !== id)].slice(0, MAX);
  (await cookies()).set(COOKIE, ids.join(","), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export async function ownsBooking(appointment: Appointment): Promise<boolean> {
  if ((await readIds()).includes(appointment.id)) return true;
  const session = await getSession();
  return !!session && session.role === "client" && session.clientId === appointment.clientId;
}
