"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Button, Card, Checkbox, TextField, Textarea } from "@/design-system";
import type { Locale, Therapist, TherapistBusiness, Therapy } from "@/lib/domain/types";
import { saveBusiness, updateRenter } from "../actions/admin";
import { useRunAction } from "../useRunAction";

const KVK_RE = /^\d{8}$/;
const BTW_RE = /^NL\d{9}B\d{2}$/;

export function RenterEditor({
  therapist,
  therapies,
  business,
}: {
  therapist: Therapist;
  therapies: Therapy[];
  business: TherapistBusiness | null;
}) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <PracticeCard therapist={therapist} therapies={therapies} />
      <BusinessCard therapistId={therapist.id} business={business} />
    </div>
  );
}

function PracticeCard({ therapist, therapies }: { therapist: Therapist; therapies: Therapy[] }) {
  const t = useTranslations("admin.renter");
  const locale = useLocale() as Locale;
  const { pending, exec } = useRunAction("admin");
  const [name, setName] = useState(therapist.displayName);
  const [ids, setIds] = useState(therapist.therapyIds);
  const [paper, setPaper] = useState(therapist.paperCalendar);
  const [bookable, setBookable] = useState(therapist.bookable);

  return (
    <Card as="section" aria-labelledby="practice-title">
      <h2 id="practice-title" className="text-lg">
        {t("practiceTitle")}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{t("practiceText")}</p>
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          exec(() => updateRenter(therapist.id, { displayName: name.trim(), therapyIds: ids, paperCalendar: paper, bookable }), {
            success: t("saved"),
          });
        }}
      >
        <TextField label={t("displayName")} value={name} onChange={(e) => setName(e.target.value)} required />
        <fieldset>
          <legend className="text-sm font-medium">{t("therapies")}</legend>
          <div className="mt-1 grid sm:grid-cols-2">
            {therapies.map((x) => (
              <Checkbox
                key={x.id}
                label={x.name[locale]}
                description={x.active ? undefined : t("therapyInactive")}
                checked={ids.includes(x.id)}
                onChange={(e) => setIds(e.target.checked ? [...ids, x.id] : ids.filter((i) => i !== x.id))}
              />
            ))}
          </div>
        </fieldset>
        <div className="border-t border-border pt-2">
          <Checkbox label={t("bookable")} description={t("bookableHint")} checked={bookable} onChange={(e) => setBookable(e.target.checked)} />
          <Checkbox label={t("paper")} description={t("paperHint")} checked={paper} onChange={(e) => setPaper(e.target.checked)} />
        </div>
        <div>
          <Button type="submit" disabled={pending || !name.trim()}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function BusinessCard({ therapistId, business }: { therapistId: string; business: TherapistBusiness | null }) {
  const t = useTranslations("admin.renter");
  const { pending, exec } = useRunAction("admin");
  const [value, setValue] = useState<TherapistBusiness>(
    business ?? { therapistId, legalName: "", tradeName: null, address: null, kvk: null, btwNumber: null, kor: false },
  );
  const [tried, setTried] = useState(false);
  const kvk = (value.kvk ?? "").replace(/\s/g, "");
  const btw = (value.btwNumber ?? "").replace(/[\s.]/g, "").toUpperCase();
  const errors = {
    legalName: !value.legalName.trim() ? t("legalNameError") : undefined,
    kvk: kvk && !KVK_RE.test(kvk) ? t("kvkError") : undefined,
    btw: btw && !BTW_RE.test(btw) ? t("btwError") : undefined,
  };
  const valid = !errors.legalName && !errors.kvk && !errors.btw;

  return (
    <Card as="section" aria-labelledby="business-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="business-title" className="text-lg">
          {t("businessTitle")}
        </h2>
        <Badge tone="neutral">{t("adminOnly")}</Badge>
      </div>
      <p className="mt-1 text-sm text-fg-muted">{t("businessText")}</p>
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (!valid) return;
          exec(
            () =>
              saveBusiness({
                ...value,
                legalName: value.legalName.trim(),
                tradeName: value.tradeName?.trim() || null,
                address: value.address?.trim() || null,
                kvk: kvk || null,
                btwNumber: btw || null,
              }),
            { success: t("businessSaved") },
          );
        }}
      >
        <TextField
          label={t("legalName")}
          value={value.legalName}
          onChange={(e) => setValue({ ...value, legalName: e.target.value })}
          error={tried ? errors.legalName : undefined}
        />
        <TextField label={t("tradeName")} optional value={value.tradeName ?? ""} onChange={(e) => setValue({ ...value, tradeName: e.target.value })} />
        <Textarea
          label={t("address")}
          optional
          rows={2}
          value={value.address ?? ""}
          onChange={(e) => setValue({ ...value, address: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("kvk")}
            optional
            inputMode="numeric"
            placeholder="12345678"
            value={value.kvk ?? ""}
            onChange={(e) => setValue({ ...value, kvk: e.target.value })}
            hint={t("kvkHint")}
            error={tried ? errors.kvk : undefined}
          />
          <TextField
            label={t("btwNumber")}
            optional
            placeholder="NL123456789B01"
            value={value.btwNumber ?? ""}
            onChange={(e) => setValue({ ...value, btwNumber: e.target.value })}
            hint={t("btwHint")}
            error={tried ? errors.btw : undefined}
          />
        </div>
        <Checkbox label={t("kor")} description={t("korHint")} checked={value.kor} onChange={(e) => setValue({ ...value, kor: e.target.checked })} />
        <div>
          <Button type="submit" disabled={pending}>
            {t("saveBusiness")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
