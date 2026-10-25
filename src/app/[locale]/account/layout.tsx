import { DemoBanner } from "@/design-system";
import { isDemoMode } from "@/lib/server/data";
import { SiteShell } from "../(site)/_components/SiteShell";

/** The client area looks like the public site (D19); demo mode is labelled (D22). */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {isDemoMode() && <DemoBanner />}
      <SiteShell>{children}</SiteShell>
    </>
  );
}
