"use client";

import { useCallback, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, Select, Sheet, TextField, Textarea, useToast } from "@/design-system";
import type { CentreEmailSettings, Locale } from "@/lib/domain/types";
import { sampleConfirmation } from "@/lib/email/booking-confirmation";
import { DEFAULT_PERSONAL_MESSAGE, MAX_MESSAGE_LENGTH } from "@/lib/email/defaults";
import type { OutboxEntry } from "@/lib/email/types";
import { saveCentreEmailInfo, sendExampleEmail } from "@/features/dashboard/actions/email";
import { useRunAction } from "@/features/dashboard/useRunAction";
import { EmailPreview } from "./EmailPreview";

/** Admin: centre information in every confirmation, with a live preview. */
export function CentreInfoEditor({ settings }: { settings: CentreEmailSettings }) {
  const t = useTranslations("email.admin");
  const tt = useTranslations("email.therapist");
  const locale = useLocale() as Locale;
  const { pending, exec } = useRunAction("admin");
  const [info, setInfo] = useState(settings.info);
  const order: Locale[] = locale === "en" ? ["en", "nl"] : ["nl", "en"];
  const tooLong = (l: Locale) => (info[l].length > MAX_MESSAGE_LENGTH ? tt("tooLong", { max: MAX_MESSAGE_LENGTH }) : undefined);
  const invalid = Boolean(tooLong("nl") || tooLong("en"));
  const data = useCallback(
    (l: Locale) => sampleConfirmation(l, { personalMessage: DEFAULT_PERSONAL_MESSAGE[l], centreInfo: info[l] }),
    [info],
  );

  return (
    <>
      <Card as="section" aria-labelledby="info-title">
        <h2 id="info-title" className="text-lg">
          {t("infoTitle")}
        </h2>
        <p className="mt-1 text-base text-fg-muted">{t("infoText")}</p>
        <form
          className="mt-5 flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) exec(() => saveCentreEmailInfo({ info }), { success: t("savedInfo") });
          }}
        >
          {order.map((l) => (
            <Textarea
              key={l}
              label={l === "nl" ? t("infoNl") : t("infoEn")}
              rows={5}
              value={info[l]}
              onChange={(e) => setInfo({ ...info, [l]: e.target.value })}
              error={tooLong(l)}
            />
          ))}
          <div>
            <Button type="submit" size="lg" disabled={pending || invalid}>
              {t("saveInfo")}
            </Button>
          </div>
        </form>
      </Card>
      <EmailPreview data={data} />
    </>
  );
}

/** Admin: send an example confirmation to any address (in the demo: only to the allowed list). */
export function ExampleSender({ defaultTo }: { defaultTo: string }) {
  const t = useTranslations("email.admin");
  const tp = useTranslations("email.preview");
  const uiLocale = useLocale() as Locale;
  const toast = useToast();
  const { pending, exec } = useRunAction("admin");
  const [to, setTo] = useState(defaultTo);
  const [locale, setLocale] = useState<Locale>(uiLocale === "en" ? "en" : "nl");

  return (
    <Card as="section" aria-labelledby="example-title">
      <h2 id="example-title" className="text-lg">
        {t("exampleTitle")}
      </h2>
      <p className="mt-1 text-base text-fg-muted">{t("exampleText")}</p>
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          exec(() => sendExampleEmail({ to, locale }), {
            onSuccess: (r) =>
              r.via === "outbox"
                ? toast.show({ title: t("exampleOutbox"), description: t("exampleOutboxText"), tone: "neutral" })
                : toast.show({ title: t("exampleSent"), description: t("exampleSentText"), tone: "success" }),
            onError: () => {
              toast.show({ title: t("exampleFailed"), tone: "danger" });
              return true;
            },
          });
        }}
      >
        <TextField label={t("exampleTo")} type="email" autoComplete="email" required value={to} onChange={(e) => setTo(e.target.value)} />
        <Select
          label={t("exampleLanguage")}
          value={locale}
          onChange={(e) => setLocale(e.target.value === "en" ? "en" : "nl")}
          options={[
            { value: "nl", label: tp("nl") },
            { value: "en", label: tp("en") },
          ]}
        />
        <div>
          <Button type="submit" size="lg" disabled={pending || !to.trim()}>
            {t("exampleSend")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

const KINDS = ["booking_confirmation", "example_confirmation", "therapist_new_booking", "invoice"] as const;

/** Admin: recent e-mails, newest first. Content only for demo e-mails. */
export function OutboxList({ entries }: { entries: OutboxEntry[] }) {
  const t = useTranslations("email.admin");
  const format = useFormatter();
  const [open, setOpen] = useState<OutboxEntry | null>(null);
  const kind = (k: string) => t(`kind.${(KINDS as readonly string[]).includes(k) ? k : "other"}`);

  return (
    <Card as="section" aria-labelledby="outbox-title" padded={false}>
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h2 id="outbox-title" className="text-lg">
          {t("outboxTitle")}
        </h2>
        <p className="mt-1 text-base text-fg-muted">{t("outboxText")}</p>
      </div>
      {entries.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState title={t("outboxEmpty")} />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold break-words">{e.subject}</p>
                <p className="text-sm text-fg-muted">
                  {kind(e.kind)} · {e.to} · {format.dateTime(new Date(e.at), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
                <Badge tone={e.via === "outbox" ? "neutral" : "success"} className="mt-1">
                  {e.via === "outbox" ? t("notSent") : t("sent")}
                </Badge>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setOpen(e)}>
                {t("view")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? t("viewTitle", { to: open.to }) : ""} description={open?.subject}>
        {open?.html ? (
          <iframe title={open.subject} srcDoc={open.html} sandbox="" className="h-[70vh] w-full rounded-md border border-border bg-white" />
        ) : (
          <p className="text-base">{t("noContent")}</p>
        )}
      </Sheet>
    </Card>
  );
}
