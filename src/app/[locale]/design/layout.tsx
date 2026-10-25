import type { Metadata } from "next";
import { ToastProvider, themeInitScript } from "@/design-system";

// Design previews are internal: keep them out of search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      <ToastProvider>{children}</ToastProvider>
    </>
  );
}
