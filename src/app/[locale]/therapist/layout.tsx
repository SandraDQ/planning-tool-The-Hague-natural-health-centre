import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/server/session";
import { DashboardShell } from "@/features/dashboard/components/DashboardShell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function TherapistLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRole("therapist", locale);
  return (
    <DashboardShell area="therapist" displayName={session.displayName}>
      {children}
    </DashboardShell>
  );
}
