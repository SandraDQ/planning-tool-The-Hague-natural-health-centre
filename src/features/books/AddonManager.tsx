"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button, Card, Icons, Sheet, TextField } from "@/design-system";
import type { BooksAddonRow } from "@/lib/server/extensions";
import { centsToInput, parseEuroInput } from "@/features/dashboard/money";
import { useRunAction } from "@/features/dashboard/useRunAction";
import { setBooksAddon, setBooksAddonFee } from "./actions";

/** Admin: who uses the bookkeeping add-on, switch it on or off, and the monthly fee (D44). */
export function AddonManager({ rows, feeCents }: { rows: BooksAddonRow[]; feeCents: number }) {
  const t = useTranslations("books.addonAdmin");
  const format = useFormatter();
  const { pending, exec } = useRunAction("admin");
  const [fee, setFee] = useState(centsToInput(feeCents));
  const [offFor, setOffFor] = useState<BooksAddonRow | null>(null);
  const cents = parseEuroInput(fee);

  return (
    <Card as="section" aria-labelledby="addon-admin-title" className="mt-10 flex flex-col gap-5" padded={false}>
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <h2 id="addon-admin-title" className="text-lg">
            {t("title")}
          </h2>
          <p className="mt-1 max-w-reading text-base text-fg-muted">{t("lead")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <TextField label={t("fee")} hint={t("feeHint")} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} error={cents === null ? t("feeError") : undefined} className="max-w-56" />
          <Button variant="secondary" disabled={pending || cents === null} onClick={() => exec(() => setBooksAddonFee(cents!), { success: t("feeSaved") })}>
            {t("saveFee")}
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {rows.map((r) => (
          <li key={r.therapistId} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="min-w-0">
              <p className="text-lg">{r.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                <Badge tone={r.status === "active" ? "success" : r.status === "requested" ? "warning" : "neutral"} icon={r.status === "active" ? <Icons.Check /> : undefined}>
                  {r.status === "active" ? t("statusActive") : r.status === "requested" ? t("statusRequested") : t("statusOff")}
                </Badge>
                {r.status === "active" && r.since && <span>{t("since", { date: format.dateTime(new Date(`${r.since}T12:00:00Z`), { day: "numeric", month: "long", year: "numeric" }) })}</span>}
                {r.status === "active" && !r.termsAccepted && <span>· {t("termsPending")}</span>}
              </div>
            </div>
            {r.status === "active" ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setOffFor(r)}>
                {t("switchOff")}
              </Button>
            ) : (
              <Button
                size="sm"
                variant={r.status === "requested" ? "primary" : "secondary"}
                disabled={pending}
                leadingIcon={<Icons.Check />}
                onClick={() => exec(() => setBooksAddon(r.therapistId, true), { success: t("switchedOn"), successText: t("switchedOnText") })}
              >
                {t("switchOn")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {offFor && (
        <Sheet
          open
          onClose={() => setOffFor(null)}
          title={t("offTitle", { name: offFor.name })}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOffFor(null)}>
                {t("cancel")}
              </Button>
              <Button disabled={pending} onClick={() => exec(() => setBooksAddon(offFor.therapistId, false), { success: t("switchedOff"), onSuccess: () => setOffFor(null) })}>
                {t("offConfirm")}
              </Button>
            </>
          }
        >
          <p className="pb-2 text-lg">{t("offText")}</p>
        </Sheet>
      )}
    </Card>
  );
}
