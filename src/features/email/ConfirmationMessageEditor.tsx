"use client";

import { useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Button, Card, Textarea } from "@/design-system";
import type { CentreEmailSettings, EmailTemplate, Locale, Service } from "@/lib/domain/types";
import { sampleConfirmation } from "@/lib/email/booking-confirmation";
import { DEFAULT_PERSONAL_MESSAGE, MAX_MESSAGE_LENGTH } from "@/lib/email/defaults";
import { removeConfirmationMessage, saveConfirmationMessage } from "@/features/dashboard/actions/email";
import { useRunAction } from "@/features/dashboard/useRunAction";
import { EmailPreview } from "./EmailPreview";

type Texts = Record<Locale, string>;

interface Props {
  therapistName: string;
  publicEmail: string | null;
  services: Pick<Service, "id" | "name">[];
  templates: EmailTemplate[];
  centre: CentreEmailSettings;
}

/** Therapist: write the personal message in the booking confirmation, with a live preview. */
export function ConfirmationMessageEditor({ therapistName, publicEmail, services, templates, centre }: Props) {
  const t = useTranslations("email.therapist");
  const general = templates.find((x) => x.serviceId === null);
  const [texts, setTexts] = useState<Texts>(general?.body ?? DEFAULT_PERSONAL_MESSAGE);
  const [previewService, setPreviewService] = useState<string | null>(null);
  const [previewTexts, setPreviewTexts] = useState<Texts | null>(null);

  const shown = previewTexts ?? texts;
  const serviceName = services.find((s) => s.id === previewService)?.name;
  const data = useCallback(
    (locale: Locale) =>
      sampleConfirmation(locale, {
        therapistName,
        therapistEmail: publicEmail,
        personalMessage: shown[locale].trim() || DEFAULT_PERSONAL_MESSAGE[locale],
        centreInfo: centre.info[locale],
        ...(serviceName ? { serviceName: serviceName[locale], sessionTypeName: "" } : {}),
      }),
    [therapistName, publicEmail, shown, centre, serviceName],
  );

  return (
    <div className="mt-6 flex flex-col gap-6">
      <MessageCard
        id="general"
        title={t("messageTitle")}
        text={t("messageText")}
        value={texts}
        onChange={(v) => {
          setTexts(v);
          setPreviewService(null);
          setPreviewTexts(null);
        }}
        submitLabel={t("save")}
        onSave={(body) => saveConfirmationMessage({ serviceId: null, body })}
      />

      <EmailPreview data={data} />

      <PerService
        services={services}
        templates={templates}
        general={texts}
        onPreview={(serviceId, v) => {
          setPreviewService(serviceId);
          setPreviewTexts(v);
        }}
      />
    </div>
  );
}

function MessageCard({
  id,
  title,
  text,
  value,
  onChange,
  submitLabel,
  onSave,
  extra,
}: {
  id: string;
  title: string;
  text?: string;
  value: Texts;
  onChange: (v: Texts) => void;
  submitLabel: string;
  onSave: (body: Texts) => ReturnType<typeof saveConfirmationMessage>;
  extra?: React.ReactNode;
}) {
  const t = useTranslations("email.therapist");
  const { pending, exec } = useRunAction("therapist");
  const tooLong = (l: Locale) => (value[l].length > MAX_MESSAGE_LENGTH ? t("tooLong", { max: MAX_MESSAGE_LENGTH }) : undefined);
  const invalid = Boolean(tooLong("nl") || tooLong("en"));
  const locale = useLocale() as Locale;
  const order: Locale[] = locale === "en" ? ["en", "nl"] : ["nl", "en"];

  return (
    <Card as="section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg">
        {title}
      </h2>
      {text && <p className="mt-1 text-base text-fg-muted">{text}</p>}
      <form
        className="mt-5 flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid) return;
          exec(() => onSave(value), { success: t("saved"), successText: t("savedText") });
        }}
      >
        {order.map((l, i) => (
          <Textarea
            key={l}
            label={t(l)}
            rows={6}
            value={value[l]}
            onChange={(e) => onChange({ ...value, [l]: e.target.value })}
            hint={i === 0 ? t("hint") : undefined}
            error={tooLong(l)}
          />
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={pending || invalid}>
            {submitLabel}
          </Button>
          {extra}
        </div>
      </form>
    </Card>
  );
}

function PerService({
  services,
  templates,
  general,
  onPreview,
}: {
  services: Pick<Service, "id" | "name">[];
  templates: EmailTemplate[];
  general: Texts;
  onPreview: (serviceId: string | null, texts: Texts | null) => void;
}) {
  const t = useTranslations("email.therapist");
  const locale = useLocale() as Locale;
  const { pending, exec } = useRunAction("therapist");
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Texts>(general);

  return (
    <Card as="section" aria-labelledby="per-service-title">
      <h2 id="per-service-title" className="text-lg">
        {t("perServiceTitle")}
      </h2>
      <p className="mt-1 text-base text-fg-muted">{t("perServiceText")}</p>
      {services.length === 0 ? (
        <p className="mt-4 text-base">{t("noServices")}</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {services.map((s) => {
            const own = templates.find((x) => x.serviceId === s.id);
            const isOpen = open === s.id;
            return (
              <li key={s.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-bold">{s.name[locale]}</p>
                    <Badge tone={own ? "accent" : "neutral"} className="mt-1">
                      {own ? t("hasOwn") : t("usesGeneral")}
                    </Badge>
                  </div>
                  <Button
                    variant="secondary"
                    aria-expanded={isOpen}
                    onClick={() => {
                      if (isOpen) {
                        setOpen(null);
                        onPreview(null, null);
                        return;
                      }
                      const start = own?.body ?? general;
                      setDraft(start);
                      setOpen(s.id);
                      onPreview(s.id, start);
                    }}
                  >
                    {isOpen ? t("close") : own ? t("edit") : t("writeOwn")}
                  </Button>
                </div>
                {isOpen && (
                  <div className="mt-4">
                    <MessageCard
                      id={`service-${s.id}`}
                      title={s.name[locale]}
                      value={draft}
                      onChange={(v) => {
                        setDraft(v);
                        onPreview(s.id, v);
                      }}
                      submitLabel={t("saveService", { service: s.name[locale] })}
                      onSave={(body) => saveConfirmationMessage({ serviceId: s.id, body })}
                      extra={
                        own ? (
                          <Button
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              exec(() => removeConfirmationMessage(s.id), {
                                success: t("removed"),
                                onSuccess: () => {
                                  setOpen(null);
                                  onPreview(null, null);
                                },
                              })
                            }
                          >
                            {t("useGeneral")}
                          </Button>
                        ) : undefined
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
