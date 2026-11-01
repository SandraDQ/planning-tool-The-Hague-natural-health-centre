"use server";

import { cookies } from "next/headers";
import { WELCOME_AREAS, welcomeCookie, type WelcomeArea } from "./areas";

const ONE_YEAR = 365 * 24 * 60 * 60;

function areaOf(form: FormData): WelcomeArea | null {
  const area = String(form.get("area") ?? "");
  return (WELCOME_AREAS as readonly string[]).includes(area) ? (area as WelcomeArea) : null;
}

/** "Got it": hide the welcome message on this device. */
export async function hideWelcome(form: FormData): Promise<void> {
  const area = areaOf(form);
  if (!area) return;
  (await cookies()).set(welcomeCookie(area), "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

/** "Help": show the welcome message again. */
export async function showWelcome(form: FormData): Promise<void> {
  const area = areaOf(form);
  if (!area) return;
  (await cookies()).delete(welcomeCookie(area));
}
