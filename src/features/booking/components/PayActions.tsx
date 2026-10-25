"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Button, ButtonLink, Notice } from "@/design-system";
import { demoPayAbandoned, demoPayFailed, demoPaySucceeded } from "../server/actions";

function formatLeft(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function PayButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function DemoButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" fullWidth disabled={pending}>
      {label}
    </Button>
  );
}

/**
 * The demo payment controls (D23) with the 15-minute hold countdown. When the
 * hold runs out the buttons give way to "Choose a time again".
 */
export function PayActions({
  appointmentId,
  holdExpiresAt,
  serverNow,
  chooseAgainHref,
}: {
  appointmentId: string;
  holdExpiresAt: string;
  serverNow: number;
  chooseAgainHref: string;
}) {
  const t = useTranslations("booking.pay");
  const locale = useLocale();
  const expiresMs = Date.parse(holdExpiresAt);
  // Server and browser clocks may differ; count down from the server's view.
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const skew = Date.now() - serverNow;
    const tick = () => setNow(Date.now() - skew);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [serverNow]);
  const left = expiresMs - now;
  const expired = left <= 0;
  const minuteMark = Math.ceil(left / 60_000);

  if (expired) {
    return (
      <Notice tone="warning" role="alert" title={t("expiredTitle")} action={<ButtonLink href={chooseAgainHref}>{t("chooseAgain")}</ButtonLink>}>
        {t("expiredText")}
      </Notice>
    );
  }

  const hidden = (
    <>
      <input type="hidden" name="id" value={appointmentId} />
      <input type="hidden" name="locale" value={locale} />
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface-2 px-4 py-3">
        <p className="text-base text-fg-muted" aria-hidden="true">
          {t("holdLeftLabel")}
        </p>
        <span aria-hidden="true" className="font-heading text-lg tabular-nums text-accent-strong">
          {formatLeft(left)}
        </span>
        {/* Screen readers hear it once a minute, not every second. */}
        <span className="sr-only" aria-live="polite">
          {t("holdLeft", { time: `${minuteMark} min` })}
        </span>
      </div>

      <form action={demoPaySucceeded}>
        {hidden}
        <PayButton label={t("payIdeal")} pendingLabel={t("paying")} />
      </form>

      <fieldset className="flex flex-col gap-3 rounded-md border border-dashed border-border-strong p-4">
        <legend className="px-1 text-sm text-fg-muted">{t("demoControls")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <form action={demoPayFailed}>
            {hidden}
            <DemoButton label={t("fail")} />
          </form>
          <form action={demoPayAbandoned}>
            {hidden}
            <DemoButton label={t("abandon")} />
          </form>
        </div>
      </fieldset>
    </div>
  );
}
