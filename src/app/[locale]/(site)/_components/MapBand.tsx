"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Icons, cn, siteContact } from "@/design-system";

const EMBED = `https://www.google.com/maps?q=${encodeURIComponent("Badhuisstraat 224, 2584 HN Den Haag")}&output=embed`;

/**
 * The wide Google map at the bottom of the live site's pages (350px high).
 * The map only loads when the visitor asks for it (no Google requests or cookies before that);
 * until then the same box shows the address and two buttons.
 * `compact` = the smaller map beside the Contact page's form (no wide box).
 */
export function MapBand({ className, compact = false }: { className?: string; compact?: boolean }) {
  const t = useTranslations("site.map");
  const [show, setShow] = useState(false);
  return (
    <section aria-labelledby="map-title" className={className ?? "bg-canvas pb-10 sm:pb-12"}>
      <h2 id="map-title" className="sr-only">
        {t("title")}
      </h2>
      <div className={compact ? "" : "mx-auto max-w-[82.5rem] sm:px-gutter"}>
        {show ? (
          <iframe
            title={t("title")}
            src={EMBED}
            className={cn("block w-full border-0", compact ? "h-[22.5rem]" : "h-[21.875rem]")}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex min-h-[21.875rem] flex-col items-center justify-center gap-4 bg-surface-2 px-gutter py-10 text-center">
            <Icons.MapPin className="size-8 text-accent" />
            <p className={compact ? "text-base" : "text-lead font-light"}>
              {siteContact.name}
              <br />
              {siteContact.address}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button variant="secondary" onClick={() => setShow(true)}>
                {t("show")}
              </Button>
              <a
                href={siteContact.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 px-2 text-accent underline underline-offset-4 hover:text-accent-strong"
              >
                {t("open")}
                <Icons.ExternalLink className="size-4" />
              </a>
            </div>
            <p className="text-sm text-fg-muted">{t("note")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
