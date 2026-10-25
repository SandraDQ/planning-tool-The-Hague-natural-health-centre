"use server";

// Server actions for the demo sign-in (D22). Dashboards can use signOutAction in a
// <form action={signOutAction}> with a hidden "locale" input.

import { redirect } from "@/i18n/navigation";
import { resetDemoStore } from "./demo";
import { isDemoMode } from "./mode";
import { getSession, homeFor, signInDemo, signOut } from "./session";

const localeOf = (formData: FormData): "nl" | "en" => (formData.get("locale") === "en" ? "en" : "nl");

export async function signInAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const accountId = String(formData.get("account") ?? "");
  const session = await signInDemo(accountId);
  if (!session) redirect({ href: { pathname: "/login", query: { error: "unknown" } }, locale });
  redirect({ href: homeFor(session!.role), locale });
}

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  await signOut();
  redirect({ href: "/login", locale });
}

/** Demo only, admin only: throw away all changes and start from fresh demo data. */
export async function resetDemoAction(formData: FormData): Promise<void> {
  const locale = localeOf(formData);
  const session = await getSession();
  if (isDemoMode() && session?.role === "admin") resetDemoStore();
  redirect({ href: { pathname: "/login", query: { reset: "1" } }, locale });
}
