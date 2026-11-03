"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, SegmentedControl } from "@/design-system";
import type { Locale } from "@/lib/domain/types";
import { renderBookingConfirmation, type ConfirmationData } from "@/lib/email/booking-confirmation";

/** Live preview of the confirmation e-mail with made-up booking details. */
export function EmailPreview({ data }: { data: (locale: Locale) => ConfirmationData }) {
  const t = useTranslations("email.preview");
  const uiLocale = useLocale() as Locale;
  const [locale, setLocale] = useState<Locale>(uiLocale === "en" ? "en" : "nl");
  const html = useMemo(() => renderBookingConfirmation(data(locale)).html, [data, locale]);

  return (
    <Card as="section" aria-labelledby="preview-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="preview-title" className="text-lg">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">{t("text")}</p>
        </div>
        <SegmentedControl
          label={t("language")}
          value={locale}
          onChange={setLocale}
          segments={[
            { value: "nl", label: t("nl") },
            { value: "en", label: t("en") },
          ]}
        />
      </div>
      <iframe
        title={t("frame")}
        srcDoc={html}
        sandbox=""
        className="mt-4 h-[44rem] w-full rounded-md border border-border bg-white"
      />
    </Card>
  );
}
