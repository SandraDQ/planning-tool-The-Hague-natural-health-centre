"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, Checkbox, EmptyState, Icons, Select, Sheet, TextField } from "@/design-system";
import type { BlockTemplate, Room, Therapist } from "@/lib/domain/types";
import { saveBlockTemplate, saveRoom } from "../actions/admin";
import { useRunAction } from "../useRunAction";
import { roomTitle } from "../rooms";

type RoomDraft = Omit<Room, "id"> & { id?: string };
type TemplateDraft = Omit<BlockTemplate, "id"> & { id?: string };

export function RoomsManager({ rooms, templates, therapists }: { rooms: Room[]; templates: BlockTemplate[]; therapists: Therapist[] }) {
  const t = useTranslations("admin.rooms");
  const [room, setRoom] = useState<RoomDraft | null>(null);
  const [template, setTemplate] = useState<TemplateDraft | null>(null);
  const nameOf = new Map(therapists.map((x) => [x.id, x.displayName]));
  const sorted = [...rooms].sort((a, b) => a.number - b.number);
  const sortedTemplates = [...templates].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const nextNumber = rooms.reduce((n, r) => Math.max(n, r.number), 0) + 1;

  return (
    <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-labelledby="rooms-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="rooms-title" className="text-lg">
            {t("listTitle")}
          </h2>
          <Button
            variant="secondary"
            size="sm"
            leadingIcon={<Icons.Plus />}
            onClick={() => setRoom({ number: nextNumber, name: "", kind: "shared", active: true, privateTherapistId: null })}
          >
            {t("add")}
          </Button>
        </div>
        {sorted.length === 0 ? (
          <Card className="mt-4">
            <EmptyState icon={<Icons.Door />} title={t("emptyTitle")} description={t("emptyText")} />
          </Card>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {sorted.map((r) => (
              <li key={r.id}>
                <Card padded={false} className="flex items-center gap-4 p-4">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-accent-soft font-heading text-lg text-accent-strong tabular-nums dark:text-accent">
                    {r.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base">{roomTitle(r.number, r.name, t("roomNumber", { number: r.number }))}</p>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                      <span>{t(`kind.${r.kind}`)}</span>
                      {r.kind === "private" && (
                        <span>· {r.privateTherapistId ? nameOf.get(r.privateTherapistId) : t("unassigned")}</span>
                      )}
                    </p>
                  </div>
                  {!r.active && <Badge tone="neutral">{t("inactive")}</Badge>}
                  <Button
                    variant="ghost"
                    size="sm"
                    leadingIcon={<Icons.Pencil />}
                    aria-label={t("editTitle", { number: r.number })}
                    onClick={() => setRoom({ ...r })}
                  >
                    <span className="hidden sm:inline">{t("edit")}</span>
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="templates-title">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="templates-title" className="text-lg">
                {t("templatesTitle")}
              </h2>
              <p className="mt-1 text-sm text-fg-muted">{t("templatesText")}</p>
            </div>
          </div>
          <ul className="mt-4 divide-y divide-border">
            {sortedTemplates.map((x) => (
              <li key={x.id} className="flex min-h-13 items-center gap-3 py-1">
                <Icons.Clock className="size-5 text-fg-muted" />
                <span className="flex-1 tabular-nums">
                  {x.startTime}–{x.endTime}
                </span>
                {!x.active && <Badge tone="neutral">{t("inactive")}</Badge>}
                <Button variant="ghost" size="sm" onClick={() => setTemplate({ ...x })}>
                  {t("edit")}
                  <span className="sr-only">
                    {" "}
                    {x.startTime}–{x.endTime}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            leadingIcon={<Icons.Plus />}
            onClick={() => setTemplate({ startTime: "18:00", endTime: "22:00", active: true })}
          >
            {t("addTemplate")}
          </Button>
        </Card>
      </section>

      {room && <RoomSheet draft={room} therapists={therapists} onClose={() => setRoom(null)} />}
      {template && <TemplateSheet draft={template} onClose={() => setTemplate(null)} />}
    </div>
  );
}

function RoomSheet({ draft, therapists, onClose }: { draft: RoomDraft; therapists: Therapist[]; onClose: () => void }) {
  const t = useTranslations("admin.rooms");
  const { pending, exec } = useRunAction("admin");
  const [value, setValue] = useState<RoomDraft>(draft);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!Number.isInteger(value.number) || value.number < 1) return setError(t("numberError"));
    setError(null);
    exec(
      () =>
        saveRoom({
          ...value,
          name: value.name.trim(),
          privateTherapistId: value.kind === "private" ? value.privateTherapistId : null,
        }),
      { success: t("saved"), onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={draft.id ? t("editTitle", { number: draft.number }) : t("addTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {t("save")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
          <TextField
            label={t("number")}
            type="number"
            inputMode="numeric"
            min={1}
            value={Number.isNaN(value.number) ? "" : value.number}
            onChange={(e) => setValue({ ...value, number: e.target.valueAsNumber })}
            error={error ?? undefined}
          />
          <TextField label={t("name")} value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} optional />
        </div>
        <Select
          label={t("kindLabel")}
          value={value.kind}
          onChange={(e) => setValue({ ...value, kind: e.target.value as Room["kind"] })}
          options={[
            { value: "shared", label: t("kind.shared") },
            { value: "private", label: t("kind.private") },
          ]}
          hint={value.kind === "shared" ? t("kindSharedHint") : t("kindPrivateHint")}
        />
        {value.kind === "private" && (
          <Select
            label={t("assigned")}
            value={value.privateTherapistId ?? ""}
            onChange={(e) => setValue({ ...value, privateTherapistId: e.target.value || null })}
            options={[{ value: "", label: t("unassigned") }, ...therapists.map((x) => ({ value: x.id, label: x.displayName }))]}
            hint={t("assignedHint")}
          />
        )}
        <Checkbox
          label={t("active")}
          description={t("activeHint")}
          checked={value.active}
          onChange={(e) => setValue({ ...value, active: e.target.checked })}
        />
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}

function TemplateSheet({ draft, onClose }: { draft: TemplateDraft; onClose: () => void }) {
  const t = useTranslations("admin.rooms");
  const { pending, exec } = useRunAction("admin");
  const [value, setValue] = useState<TemplateDraft>(draft);
  const invalid = !value.startTime || !value.endTime || value.endTime <= value.startTime;

  return (
    <Sheet
      open
      onClose={onClose}
      title={draft.id ? t("editTemplate") : t("addTemplate")}
      description={t("templateHint")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={pending || invalid} onClick={() => exec(() => saveBlockTemplate(value), { success: t("saved"), onSuccess: onClose })}>
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          <TextField label={t("from")} type="time" step={900} value={value.startTime} onChange={(e) => setValue({ ...value, startTime: e.target.value })} />
          <TextField
            label={t("to")}
            type="time"
            step={900}
            value={value.endTime}
            onChange={(e) => setValue({ ...value, endTime: e.target.value })}
            error={value.endTime && value.endTime <= value.startTime ? t("timeError") : undefined}
          />
        </div>
        <Checkbox label={t("templateActive")} checked={value.active} onChange={(e) => setValue({ ...value, active: e.target.checked })} />
      </div>
    </Sheet>
  );
}
