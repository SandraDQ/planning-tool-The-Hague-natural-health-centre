import type { ReactNode } from "react";
import { DisplayHeading, cn } from "@/design-system";
import type { ContentImage } from "@/content";
import { SiteImage } from "./SiteImage";

/** The live site's page title: small band, condensed taupe capitals, centred (THERAPIES, EVENTS…). */
export function PageTitle({ id = "page-title", children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-canvas px-gutter pt-8 pb-3 text-center", className)}>
      <DisplayHeading as="h1" id={id}>
        {children}
      </DisplayHeading>
    </div>
  );
}

/**
 * The live site's wide photo box with one large white sentence on it
 * (Therapies, Conditions): the green-toned "Wix site" photo, 1320px wide.
 * White text on the photo is large text only (33px on desktop).
 */
export function ImageBanner({ image, children, className }: { image: ContentImage; children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto max-w-[82.5rem] sm:px-gutter", className)}>
      <div className="relative isolate overflow-hidden px-gutter py-12 text-center sm:px-16 sm:py-16">
        <SiteImage image={{ ...image, alt: "" }} sizes="(min-width: 1320px) 1320px, 100vw" fill priority className="absolute inset-0 -z-10" />
        <div className="absolute inset-0 -z-10 bg-sage/80" />
        <p className="mx-auto max-w-[45rem] text-[1.5rem] leading-[1.75] font-light text-on-accent sm:text-[2.0625rem]">{children}</p>
      </div>
    </div>
  );
}
