"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Button, Card, Checkbox, EmptyState, Icons, Select, Sheet, TextField, Textarea } from "@/design-system";
import type { Locale, Service, SessionType, Therapy } from "@/lib/domain/types";
import { saveService, saveSessionType } from "../actions/therapist";
import { centsToInput, formatEuro, parseEuroInput } from "../money";
import { useRunAction } from "../useRunAction";

type ServiceDraft = Omit<Service, "id" | "therapistId"> & { id?: string };
type TypeDraft = Omit<SessionType, "id"> & { id?: string };

export function ServicesManager({ services, sessionTypes, therapies }: { services: Service[]; sessionTypes: SessionType[]; therapies: Therapy[] }) {
  const t = useTranslations("therapist.services");
  const locale = useLocale() as Locale;
  const [service, setService] = useState<ServiceDraft | null>(null);
  const [type, setType] = useState<TypeDraft | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const visible = services.filter((s) => showArchived || !s.archived);
  const archivedCount = services.filter((s) => s.archived).length;

  const deposit = (s: Service) => (s.depositType === "percent" ? `${s.depositValue}%` : formatEuro(s.depositValue, locale));

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button
          leadingIcon={<Icons.Plus />}
          onClick={() =>
            setService({
              therapyId: therapies[0]?.id ?? "",
              name: { nl: "", en: "" },
              description: { nl: "", en: "" },
              depositType: "fixed",
              depositValue: 2000,
              archived: false,
            })
          }
        >
          {t("add")}
        </Button>
        {archivedCount > 0 && (
          <Checkbox label={t("showArchived", { count: archivedCount })} checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        )}
      </div>

      {visible.length === 0 ? (
        <Card className="mt-4">
          <EmptyState icon={<Icons.Leaf />} title={t("emptyTitle")} description={t("emptyText")} />
        </Card>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {visible.map((s) => {
            const types = sessionTypes.filter((st) => st.serviceId === s.id).sort((a, b) => a.durationMin - b.durationMin);
            return (
              <li key={s.id}>
                <Card padded={false} className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-heading text-lg">{s.name[locale]}</p>
                      <p className="text-sm text-fg-muted">
                        {therapies.find((x) => x.id === s.therapyId)?.name[locale] ?? "—"} · {t("depositShort", { amount: deposit(s) })}
                      </p>
                    </div>
                    {s.archived && <Badge tone="neutral">{t("archived")}</Badge>}
                    <Button variant="ghost" size="sm" leadingIcon={<Icons.Pencil />} aria-label={t("editNamed", { name: s.name[locale] })} onClick={() => setService({ ...s })}>
                      <span className="hidden sm:inline">{t("edit")}</span>
                    </Button>
                  </div>
                  <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                    {types.map((st) => (
                      <li key={st.id}>
                        <button
                          type="button"
                          onClick={() => setType({ ...st })}
                          className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
                        >
                          <span className="min-w-0 flex-1 truncate">{st.name[locale]}</span>
                          <span className="shrink-0 text-sm text-fg-muted tabular-nums">{t("minutes", { count: st.durationMin })}</span>
                          <span className="w-20 shrink-0 text-right tabular-nums">{formatEuro(st.priceCents, locale)}</span>
                          <Icons.ChevronRight className="size-4 shrink-0 text-fg-muted" />
                        </button>
                      </li>
                    ))}
                    {types.length === 0 && <li className="px-3 py-3 text-sm text-fg-muted">{t("noTypes")}</li>}
                  </ul>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 -ml-3"
                    leadingIcon={<Icons.Plus />}
                    onClick={() => setType({ serviceId: s.id, name: { nl: "", en: "" }, durationMin: 60, priceCents: 7500 })}
                  >
                    {t("addType")}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 flex items-start gap-2 text-sm text-fg-muted">
        <Icons.Info className="mt-0.5 size-4 shrink-0" />
        {t("snapshotNote")}
      </p>

      {service && <ServiceSheet draft={service} therapies={therapies} onClose={() => setService(null)} />}
      {type && <TypeSheet draft={type} onClose={() => setType(null)} />}
    </>
  );
}

function ServiceSheet({ draft, therapies, onClose }: { draft: ServiceDraft; therapies: Therapy[]; onClose: () => void }) {
  const t = useTranslations("therapist.services");
  const locale = useLocale() as Locale;
  const { pending, exec } = useRunAction("therapist");
  const [value, setValue] = useState(draft);
  const [depositInput, setDepositInput] = useState(draft.depositType === "fixed" ? centsToInput(draft.depositValue) : String(draft.depositValue));
  const [tried, setTried] = useState(false);

  const depositValue =
    value.depositType === "fixed"
      ? parseEuroInput(depositInput)
      : /^\d{1,3}$/.test(depositInput.trim()) && Number(depositInput) >= 1 && Number(depositInput) <= 100
        ? Number(depositInput)
        : null;
  const depositOk = depositValue != null && (value.depositType === "percent" || depositValue >= 100);
  const nameOk = value.name.nl.trim() && value.name.en.trim();

  return (
    <Sheet
      open
      onClose={onClose}
      title={draft.id ? t("editTitle") : t("addTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              setTried(true);
              if (!nameOk || !depositOk || !value.therapyId) return;
              exec(() => saveService({ ...value, depositValue: depositValue! }), { success: t("saved"), onSuccess: onClose });
            }}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <TextField
          label={t("nameNl")}
          value={value.name.nl}
          onChange={(e) => setValue({ ...value, name: { ...value.name, nl: e.target.value } })}
          error={tried && !value.name.nl.trim() ? t("nameError") : undefined}
        />
        <TextField
          label={t("nameEn")}
          value={value.name.en}
          onChange={(e) => setValue({ ...value, name: { ...value.name, en: e.target.value } })}
          error={tried && !value.name.en.trim() ? t("nameError") : undefined}
        />
        <Select
          label={t("therapy")}
          value={value.therapyId}
          onChange={(e) => setValue({ ...value, therapyId: e.target.value })}
          options={therapies.map((x) => ({ value: x.id, label: x.name[locale] }))}
          hint={t("therapyHint")}
        />
        <Textarea
          label={t("descriptionNl")}
          optional
          rows={3}
          value={value.description.nl}
          onChange={(e) => setValue({ ...value, description: { ...value.description, nl: e.target.value } })}
        />
        <Textarea
          label={t("descriptionEn")}
          optional
          rows={3}
          value={value.description.en}
          onChange={(e) => setValue({ ...value, description: { ...value.description, en: e.target.value } })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t("depositType")}
            value={value.depositType}
            onChange={(e) => {
              const depositType = e.target.value as Service["depositType"];
              setValue({ ...value, depositType });
              setDepositInput(depositType === "fixed" ? "20.00" : "25");
            }}
            options={[
              { value: "fixed", label: t("depositFixed") },
              { value: "percent", label: t("depositPercent") },
            ]}
          />
          <TextField
            label={value.depositType === "fixed" ? t("depositAmount") : t("depositPercentage")}
            inputMode="decimal"
            value={depositInput}
            onChange={(e) => setDepositInput(e.target.value)}
            error={tried && !depositOk ? t("depositError") : undefined}
          />
        </div>
        <p className="text-sm text-fg-muted">{t("depositHint")}</p>
        {draft.id && (
          <Checkbox
            label={t("archive")}
            description={t("archiveHint")}
            checked={value.archived}
            onChange={(e) => setValue({ ...value, archived: e.target.checked })}
          />
        )}
      </div>
    </Sheet>
  );
}

function TypeSheet({ draft, onClose }: { draft: TypeDraft; onClose: () => void }) {
  const t = useTranslations("therapist.services");
  const { pending, exec } = useRunAction("therapist");
  const [value, setValue] = useState(draft);
  const [price, setPrice] = useState(centsToInput(draft.priceCents));
  const [tried, setTried] = useState(false);
  const cents = parseEuroInput(price);
  const durationOk = Number.isInteger(value.durationMin) && value.durationMin >= 5 && value.durationMin % 5 === 0 && value.durationMin <= 480;
  const nameOk = value.name.nl.trim() && value.name.en.trim();

  return (
    <Sheet
      open
      onClose={onClose}
      title={draft.id ? t("editType") : t("addType")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              setTried(true);
              if (!nameOk || !durationOk || cents == null) return;
              exec(() => saveSessionType({ ...value, priceCents: cents }), { success: t("saved"), onSuccess: onClose });
            }}
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <TextField
          label={t("typeNameNl")}
          placeholder={t("typePlaceholder")}
          value={value.name.nl}
          onChange={(e) => setValue({ ...value, name: { ...value.name, nl: e.target.value } })}
          error={tried && !value.name.nl.trim() ? t("nameError") : undefined}
        />
        <TextField
          label={t("typeNameEn")}
          value={value.name.en}
          onChange={(e) => setValue({ ...value, name: { ...value.name, en: e.target.value } })}
          error={tried && !value.name.en.trim() ? t("nameError") : undefined}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t("duration")}
            type="number"
            inputMode="numeric"
            min={5}
            step={5}
            value={Number.isNaN(value.durationMin) ? "" : value.durationMin}
            onChange={(e) => setValue({ ...value, durationMin: e.target.valueAsNumber })}
            hint={t("durationHint")}
            error={tried && !durationOk ? t("durationError") : undefined}
          />
          <TextField
            label={t("price")}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={tried && cents == null ? t("priceError") : undefined}
          />
        </div>
      </div>
    </Sheet>
  );
}
