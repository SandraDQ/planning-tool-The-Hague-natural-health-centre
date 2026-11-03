"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Icons } from "@/design-system";

/**
 * Welcome card for a page (D30: easy for older users, a good onboarding message):
 * a short title and three numbered steps in large text. Shown until "Got it" is tapped,
 * then folded into one "How does this page work?" button that opens it again.
 */
export function HowItWorks({ storageKey, title, steps }: { storageKey: string; title: string; steps: string[] }) {
  const t = useTranslations("invoices.common");
  // Start open on the server and first paint, so the message is never missed; fold after reading storage.
  const [open, setOpen] = useState(true);
  const key = `thnhc.welcome.${storageKey}`;

  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) === "seen") setOpen(false);
    } catch {
      /* private mode: keep it open */
    }
  }, [key]);

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(key, "seen");
    } catch {
      /* ignore */
    }
  };

  if (!open) {
    return (
      <div className="mt-4">
        <Button variant="ghost" size="sm" leadingIcon={<Icons.Info />} onClick={() => setOpen(true)}>
          {t("help")}
        </Button>
      </div>
    );
  }

  return (
    <Card as="section" aria-labelledby={`${storageKey}-welcome`} className="mt-5 border-sage bg-accent-soft/40">
      <h2 id={`${storageKey}-welcome`} className="text-lg">
        {title}
      </h2>
      <ol className="mt-3 flex flex-col gap-3">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-lg leading-relaxed">
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-base font-bold text-on-accent">
              {i + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <Button onClick={close} leadingIcon={<Icons.Check />}>
          {t("gotIt")}
        </Button>
      </div>
    </Card>
  );
}
