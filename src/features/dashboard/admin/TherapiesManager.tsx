"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Button, Card, Checkbox, EmptyState, Icons, Sheet, TextField } from "@/design-system";
import type { Locale, Therapist, Therapy } from "@/lib/domain/types";
import { PageHeading } from "../components/Page";
import { saveTherapy } from "../actions/admin";
import { useRunAction } from "../useRunAction";

type Draft = Omit<Therapy, "id"> & { id?: string };

export function TherapiesManager({ therapies, therapists }: { therapies: Therapy[]; therapists: Therapist[] }) {
  const t = useTranslations("admin.therapies");
  const locale = useLocale() as Locale;
  const [draft, setDraft] = useState<Draft | null>(null);
  const sorted = [...therapies].sort((a, b) => a.name[locale].localeCompare(b.name[locale], locale));
  const count = (id: string) => therapists.filter((x) => x.therapyIds.includes(id)).length;

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("lead")}
        actions={
          <Button leadingIcon={<Icons.Plus />} onClick={() => setDraft({ name: { nl: "", en: "" }, active: true })}>
            {t("add")}
          </Button>
        }
      />
      <Card className="mt-8" padded={false}>
        {sorted.length === 0 ? (
          <EmptyState icon={<Icons.Leaf />} title={t("emptyTitle")} description={t("emptyText")} />
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((x) => (
              <li key={x.id} className="flex min-h-16 items-center gap-3 px-4 py-2 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base">{x.name[locale]}</p>
                  <p className="truncate text-sm text-fg-muted">
                    {x.name[locale === "nl" ? "en" : "nl"]} · {t("usedBy", { count: count(x.id) })}
                  </p>
                </div>
                {!x.active && <Badge tone="neutral">{t("hidden")}</Badge>}
                <Button variant="ghost" size="sm" leadingIcon={<Icons.Pencil />} aria-label={t("editNamed", { name: x.name[locale] })} onClick={() => setDraft({ ...x })}>
                  <span className="hidden sm:inline">{t("edit")}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {draft && <TherapySheet draft={draft} onClose={() => setDraft(null)} />}
    </>
  );
}

function TherapySheet({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const t = useTranslations("admin.therapies");
  const { pending, exec } = useRunAction("admin");
  const [value, setValue] = useState(draft);
  const valid = value.name.nl.trim() && value.name.en.trim();
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
            disabled={pending || !valid}
            onClick={() =>
              exec(() => saveTherapy({ ...value, name: { nl: value.name.nl.trim(), en: value.name.en.trim() } }), {
                success: t("saved"),
                onSuccess: onClose,
              })
            }
          >
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <TextField label={t("nameNl")} value={value.name.nl} onChange={(e) => setValue({ ...value, name: { ...value.name, nl: e.target.value } })} />
        <TextField label={t("nameEn")} value={value.name.en} onChange={(e) => setValue({ ...value, name: { ...value.name, en: e.target.value } })} />
        <Checkbox label={t("active")} description={t("activeHint")} checked={value.active} onChange={(e) => setValue({ ...value, active: e.target.checked })} />
      </div>
    </Sheet>
  );
}
