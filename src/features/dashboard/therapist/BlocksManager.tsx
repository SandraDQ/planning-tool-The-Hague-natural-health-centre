"use client";

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Badge, Button, ButtonLink, Card, Checkbox, EmptyState, Icons, RadioCardGroup, Select, Sheet, TextField, dayToDate } from "@/design-system";
import type { BlockTemplate, Interval, Locale, Room, RoomBlock, Service, SessionType } from "@/lib/domain/types";
import { releaseBlock, reserveBlock } from "../actions/therapist";
import { sessionsInBlock } from "../sessions";
import { addDays, isoWeekNumber, localDay, localTime, localToIso, minutesBetween, mondayOf, toMinutes } from "../time";
import { useRunAction } from "../useRunAction";
import { roomExtraName } from "../rooms";

type Taken = Pick<RoomBlock, "id" | "roomId" | "period"> & { mine: boolean };

type Props = {
  blocks: RoomBlock[];
  /** Live appointments per block id. */
  counts: Record<string, number>;
  rooms: Room[];
  templates: BlockTemplate[];
  taken: Taken[];
  takenRange: Interval;
  services: Service[];
  sessionTypes: SessionType[];
  bufferMinutes: number;
  today: string;
};

export function BlocksManager(props: Props) {
  const t = useTranslations("therapist.blocks");
  const format = useFormatter();
  const [reserving, setReserving] = useState(false);
  const [releasing, setReleasing] = useState<RoomBlock | null>(null);
  const roomNumber = new Map(props.rooms.map((r) => [r.id, r.number]));
  const hasShared = props.rooms.some((r) => r.kind === "shared");

  const byWeek = new Map<string, RoomBlock[]>();
  for (const b of props.blocks) {
    const m = mondayOf(localDay(b.period.start));
    byWeek.set(m, [...(byWeek.get(m) ?? []), b]);
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl">{t("title")}</h1>
          <p className="mt-1 max-w-reading text-base text-fg-muted">{t("lead")}</p>
        </div>
        {hasShared && (
          <Button leadingIcon={<Icons.Plus />} onClick={() => setReserving(true)}>
            {t("reserve")}
          </Button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className="text-lg">
            {t("upcoming")}
          </h2>
          {props.blocks.length === 0 ? (
            <Card className="mt-3">
              <EmptyState
                icon={<Icons.Layers />}
                title={t("emptyTitle")}
                description={t("emptyText")}
                action={
                  hasShared ? (
                    <Button variant="secondary" onClick={() => setReserving(true)}>
                      {t("reserve")}
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <div className="mt-3 flex flex-col gap-5">
              {[...byWeek.entries()].map(([monday, list]) => (
                <div key={monday}>
                  <p className="mb-2 text-sm font-medium text-fg-muted">
                    {t("weekOf", { number: isoWeekNumber(monday), date: format.dateTime(dayToDate(monday), { day: "numeric", month: "short" }) })}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {list.map((b) => {
                      const n = props.counts[b.id] ?? 0;
                      return (
                        <li key={b.id}>
                          <Card padded={false} className="flex items-center gap-3 p-3 sm:p-4">
                            <span className="flex w-12 shrink-0 flex-col items-center">
                              <span className="text-sm text-fg-muted">
                                {format.dateTime(dayToDate(localDay(b.period.start)), { weekday: "short" }).replace(".", "")}
                              </span>
                              <span className="font-heading text-lg leading-tight tabular-nums">
                                {format.dateTime(dayToDate(localDay(b.period.start)), { day: "numeric" })}
                              </span>
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 text-base whitespace-nowrap tabular-nums">
                                {localTime(b.period.start)}–{localTime(b.period.end)}
                                {b.seriesId && (
                                  <>
                                    <Icons.Repeat className="size-4 text-accent" />
                                    <span className="sr-only">{t("weekly")}</span>
                                  </>
                                )}
                              </p>
                              <p className="text-sm text-fg-muted">
                                {t("room", { number: roomNumber.get(b.roomId) ?? "?" })} · {t("appointments", { count: n })}
                              </p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setReleasing(b)}>
                              {t("release")}
                            </Button>
                          </Card>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="order-first lg:order-none">
          <FitPreview {...props} />
        </aside>
      </div>

      {reserving && <ReserveSheet {...props} onClose={() => setReserving(false)} />}
      {releasing && (
        <ReleaseSheet
          block={releasing}
          roomNumber={roomNumber.get(releasing.roomId) ?? 0}
          count={props.counts[releasing.id] ?? 0}
          onClose={() => setReleasing(null)}
        />
      )}
    </>
  );
}

/** The 3.3 live preview: how many sessions of each type fit in each block time. */
function FitPreview({ templates, services, sessionTypes, bufferMinutes }: Props) {
  const t = useTranslations("therapist.blocks");
  const locale = useLocale() as Locale;
  const live = new Set(services.filter((s) => !s.archived).map((s) => s.id));
  const types = sessionTypes.filter((st) => live.has(st.serviceId));
  return (
    <Card>
      <h2 className="text-lg">{t("fitTitle")}</h2>
      <p className="mt-1 text-sm text-fg-muted">{t("fitText", { buffer: bufferMinutes })}</p>
      {types.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">{t("fitNoServices")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {templates.map((tpl) => {
            const minutes = toMinutes(tpl.endTime) - toMinutes(tpl.startTime);
            return (
              <li key={tpl.id}>
                <p className="text-base tabular-nums">
                  {tpl.startTime}–{tpl.endTime}
                </p>
                <ul className="mt-1 text-sm text-fg-muted">
                  {types.map((st) => (
                    <li key={st.id} className="flex justify-between gap-3">
                      <span className="truncate">
                        {st.name[locale]} ({st.durationMin}′)
                      </span>
                      <span className="shrink-0 text-fg tabular-nums">
                        {t("fitCount", { count: sessionsInBlock(minutes, st.durationMin, bufferMinutes) })}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      <ButtonLink href="/therapist/settings/availability" variant="ghost" size="sm" className="mt-3 -ml-3">
        {t("changeBuffer")}
      </ButtonLink>
    </Card>
  );
}

function ReserveSheet({ rooms, templates, taken, takenRange, services, sessionTypes, bufferMinutes, today, onClose }: Props & { onClose: () => void }) {
  const t = useTranslations("therapist.blocks");
  const format = useFormatter();
  const locale = useLocale() as Locale;
  const { pending, exec } = useRunAction("therapist");
  const shared = rooms.filter((r) => r.kind === "shared").sort((a, b) => a.number - b.number);
  const [date, setDate] = useState(addDays(today, 1));
  const [choice, setChoice] = useState<string>("");
  const [weekly, setWeekly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const live = new Set(services.filter((s) => !s.archived).map((s) => s.id));
  const types = sessionTypes.filter((st) => live.has(st.serviceId));
  const [previewType, setPreviewType] = useState(types[0]?.id ?? "");
  const known = date >= localDay(takenRange.start) && date < localDay(takenRange.end);

  const isTaken = (roomId: string, tpl: BlockTemplate) => {
    const start = localToIso(date, tpl.startTime);
    const end = localToIso(date, tpl.endTime);
    return taken.find((b) => b.roomId === roomId && b.period.start < end && b.period.end > start);
  };

  const options = shared.flatMap((room) =>
    templates.map((tpl) => {
      const hit = known ? isTaken(room.id, tpl) : undefined;
      return {
        value: `${room.id}|${tpl.id}`,
        title: t("blockLabel", { number: room.number, start: tpl.startTime, end: tpl.endTime }),
        description: roomExtraName(room.number, room.name) || undefined,
        meta: hit ? <Badge tone={hit.mine ? "accent" : "neutral"}>{hit.mine ? t("yours") : t("taken")}</Badge> : <Badge tone="success">{t("free")}</Badge>,
        disabled: Boolean(hit),
      };
    }),
  );

  const [roomId, templateId] = choice.split("|");
  const tpl = templates.find((x) => x.id === templateId);
  const st = types.find((x) => x.id === previewType);
  const fit = tpl && st ? sessionsInBlock(minutesBetween(localToIso(date, tpl.startTime), localToIso(date, tpl.endTime)), st.durationMin, bufferMinutes) : null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("reserveTitle")}
      description={t("reserveText")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={pending || !roomId || !templateId || date <= today}
            onClick={() => {
              setError(null);
              exec(() => reserveBlock({ roomId, blockTemplateId: templateId, date, weekly }), {
                success: t("reserved"),
                onSuccess: onClose,
                onError: (r) => {
                  if (r.code === "block_taken") {
                    setError(t("takenError"));
                    return true;
                  }
                },
              });
            }}
          >
            {t("reserveConfirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <TextField
          label={t("date")}
          type="date"
          min={addDays(today, 1)}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setChoice("");
          }}
          hint={date ? format.dateTime(dayToDate(date), { weekday: "long", day: "numeric", month: "long" }) : undefined}
        />
        <RadioCardGroup legend={t("chooseBlock")} name="block" value={choice} onChange={setChoice} options={options} />
        {!known && <p className="text-sm text-fg-muted">{t("unknownAvailability")}</p>}
        <Checkbox
          label={t("weeklyLabel")}
          description={t("weeklyHint", { weekday: date ? format.dateTime(dayToDate(date), { weekday: "long" }) : "" })}
          checked={weekly}
          onChange={(e) => setWeekly(e.target.checked)}
        />
        {types.length > 0 && (
          <div className="rounded-md bg-accent-soft p-4">
            <Select
              label={t("previewWith")}
              value={previewType}
              onChange={(e) => setPreviewType(e.target.value)}
              options={types.map((x) => ({ value: x.id, label: `${x.name[locale]} (${x.durationMin}′)` }))}
            />
            <p className="mt-3 font-heading text-lg text-accent-strong dark:text-accent" aria-live="polite">
              {fit == null ? t("previewPick") : t("previewFit", { count: fit, buffer: bufferMinutes })}
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning">
            <Icons.Alert className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function ReleaseSheet({ block, roomNumber, count, onClose }: { block: RoomBlock; roomNumber: number; count: number; onClose: () => void }) {
  const t = useTranslations("therapist.blocks");
  const format = useFormatter();
  const { pending, exec } = useRunAction("therapist");
  const [blocked, setBlocked] = useState(false);
  return (
    <Sheet
      open
      onClose={onClose}
      title={t("releaseTitle", { number: roomNumber, start: localTime(block.period.start), end: localTime(block.period.end) })}
      description={format.dateTime(dayToDate(localDay(block.period.start)), { weekday: "long", day: "numeric", month: "long" })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("keepBlock")}
          </Button>
          <Button
            disabled={pending || blocked || count > 0}
            onClick={() =>
              exec(() => releaseBlock(block.id), {
                success: t("released"),
                onSuccess: onClose,
                onError: (r) => {
                  if (r.code === "block_has_appointments") {
                    setBlocked(true);
                    return true;
                  }
                },
              })
            }
          >
            {t("releaseConfirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        {count > 0 || blocked ? (
          <div role={blocked ? "alert" : undefined} className="flex items-start gap-3 rounded-md bg-warning-soft p-4 text-warning">
            <Icons.Alert className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">{t("hasBookingsTitle", { count: Math.max(count, 1) })}</p>
              <p className="mt-1 text-sm">{t("hasBookingsText")}</p>
            </div>
          </div>
        ) : (
          <p className="text-base">{t("releaseText")}</p>
        )}
        {block.seriesId && <p className="text-sm text-fg-muted">{t("releaseOneNote")}</p>}
      </div>
    </Sheet>
  );
}
