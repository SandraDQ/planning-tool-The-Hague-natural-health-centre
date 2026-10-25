import { DemoBanner } from "@/design-system";
import { isDemoMode } from "@/lib/server/data";
import { SiteShell } from "../(site)/_components/SiteShell";

/** Booking screens keep the public site's header and footer (D19); demo mode is labelled (D22). */
export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {isDemoMode() && <DemoBanner />}
      <SiteShell>{children}</SiteShell>
    </>
  );
}
