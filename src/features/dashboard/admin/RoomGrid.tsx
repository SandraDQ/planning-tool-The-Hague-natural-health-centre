"use client";

import { useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Badge, Button, ButtonLink, Card, Checkbox, DatePicker, Icons, Select, Sheet, cn, dayToDate } from "@/design-system";
import type { Appointment, BlockTemplate, Locale, Room, RoomBlock, Therapist } from "@/lib/domain/types";
import { assignBlock, releaseBlockAsAdmin } from "../actions/admin";
import { useRunAction } from "../useRunAction";
import { addDays, isoWeekNumber, localDay, localTime, overlaps, todayLocal } from "../time";
import { roomExtraName } from "../rooms";

type Props = {
  monday: string;
  days: string[];
  rooms: Room[];
  blocks: RoomBlock[];
  appointments: Appointment[];
  templates: BlockTemplate[];
  therapists: Therapist[];
};

type Assigning = { room: Room; template: BlockTemplate; day: string };

const LIVE = new Set(["held", "confirmed"]);

export function RoomGrid({ monday, days, rooms, blocks, appointments, templates, therapists }: Props) {
  const t = useTranslations("admin.grid");
  const format = useFormatter();
  const today = todayLocal();
  const [selectedDay, setSelectedDay] = useState(days.includes(today) ? today : days[0]);
  const [openBlock, setOpenBlock] = useState<RoomBlock | null>(null);
  const [openPrivate, setOpenPrivate] = useState<{ room: Room; day: string } | null>(null);
  const [assigning, setAssigning] = useState<Assigning | null>(null);

  const activeRooms = rooms.filter((r) => r.active).sort((a, b) => a.number - b.number);
  const activeTemplates = templates.filter((x) => x.active).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const reserved = blocks.filter((b) => b.status === "reserved");
  const nameOf = new Map(therapists.map((x) => [x.id, x.displayName]));

  const blocksFor = (roomId: string, day: string) =>
    reserved.filter((b) => b.roomId === roomId && localDay(b.period.start) === day).sort((a, b) => a.period.start.localeCompare(b.period.start));
  const apptsInBlock = (b: RoomBlock) =>
    appointments.filter((a) => LIVE.has(a.status) && (a.roomBlockId === b.id || (a.roomId === b.roomId && overlaps(a.session, b.period))));
  const apptsFor = (roomId: string, day: string) =>
    appointments.filter((a) => LIVE.has(a.status) && a.roomId === roomId && localDay(a.session.start) === day);

  const cell = (room: Room, day: string, layout: "grid" | "list") => {
    if (room.kind === "private") {
      const n = apptsFor(room.id, day).length;
      return (
        <button
          type="button"
          onClick={() => setOpenPrivate({ room, day })}
          className="flex min-h-11 w-full flex-col items-start justify-center rounded-sm border border-border bg-surface-2/60 px-2 py-1.5 text-left text-sm hover:border-sage"
        >
          <span className="w-full truncate">{room.privateTherapistId ? nameOf.get(room.privateTherapistId) : t("unassigned")}</span>
          <span className="text-fg-muted">{t("appointments", { count: n })}</span>
        </button>
      );
    }
    const dayBlocks = blocksFor(room.id, day);
    const used = new Set<string>();
    const slots = activeTemplates.map((tpl) => {
      const block = dayBlocks.find((b) => localTime(b.period.start) === tpl.startTime);
      if (block) used.add(block.id);
      return { tpl, block };
    });
    const extra = dayBlocks.filter((b) => !used.has(b.id));
    return (
      <div className={cn("flex gap-1.5", layout === "grid" ? "flex-col" : "flex-col sm:flex-row")}>
        {slots.map(({ tpl, block }) =>
          block ? (
            <BlockChip key={tpl.id} block={block} name={nameOf.get(block.therapistId) ?? "?"} count={apptsInBlock(block).length} onOpen={() => setOpenBlock(block)} />
          ) : day < today ? (
            <span
              key={tpl.id}
              className={cn(
                "flex w-full flex-1 gap-1.5 rounded-sm px-2 text-sm text-fg-muted/70",
                layout === "grid" ? "min-h-[4.5rem] items-start pt-1.5" : "min-h-11 items-center",
              )}
            >
              <span className="tabular-nums">{tpl.startTime}</span>
              <span>–</span>
            </span>
          ) : (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setAssigning({ room, template: tpl, day })}
              aria-label={t("assignLabel", { number: room.number, start: tpl.startTime, end: tpl.endTime, day: format.dateTime(dayToDate(day), { weekday: "long", day: "numeric", month: "long" }) })}
              className={cn(
                "flex w-full flex-1 gap-1.5 rounded-sm border border-dashed border-border-strong/60 px-2 text-left text-sm text-fg-muted transition-colors duration-150 hover:border-accent hover:bg-accent-soft/40 hover:text-accent-strong",
                layout === "grid" ? "min-h-[4.5rem] items-start pt-1.5" : "min-h-11 items-center",
              )}
            >
              <Icons.Plus className="mt-0.5 size-4 shrink-0" />
              <span className="tabular-nums">{tpl.startTime}</span>
              <span>{t("free")}</span>
            </button>
          ),
        )}
        {extra.map((b) => (
          <BlockChip key={b.id} block={b} name={nameOf.get(b.therapistId) ?? "?"} count={apptsInBlock(b).length} onOpen={() => setOpenBlock(b)} />
        ))}
      </div>
    );
  };

  const weekTitle = t("week", {
    number: isoWeekNumber(monday),
    from: format.dateTime(dayToDate(monday), { day: "numeric", month: "short" }),
    to: format.dateTime(dayToDate(days[6]), { day: "numeric", month: "short" }),
  });

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="font-heading text-lg">{weekTitle}</p>
        <div className="flex items-center">
          <ButtonLink href={{ pathname: "/admin/grid", query: { week: addDays(monday, -7) } }} variant="ghost" size="sm" aria-label={t("previousWeek")}>
            <Icons.ChevronLeft />
          </ButtonLink>
          <ButtonLink href="/admin/grid" variant="ghost" size="sm">
            {t("thisWeek")}
          </ButtonLink>
          <ButtonLink href={{ pathname: "/admin/grid", query: { week: addDays(monday, 7) } }} variant="ghost" size="sm" aria-label={t("nextWeek")}>
            <Icons.ChevronRight />
          </ButtonLink>
        </div>
      </div>

      {/* Tablet / desktop: rooms × days */}
      <Card padded={false} className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[60rem] table-fixed border-collapse text-left">
          <caption className="sr-only">{weekTitle}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="w-28 px-3 py-3 text-sm font-medium text-fg-muted">
                {t("room")}
              </th>
              {days.map((d) => (
                <th key={d} scope="col" className={cn("px-1.5 py-2 text-center text-sm font-normal", d === today && "bg-accent-soft")}>
                  <span className="block text-fg-muted">{format.dateTime(dayToDate(d), { weekday: "short" }).replace(".", "")}</span>
                  <span className="block font-heading text-lg leading-tight tabular-nums">{format.dateTime(dayToDate(d), { day: "numeric" })}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {activeRooms.map((room) => (
              <tr key={room.id} className="align-top">
                <th scope="row" className="px-3 py-3 font-normal">
                  <span className="block font-heading text-base">{t("roomNumber", { number: room.number })}</span>
                  {roomExtraName(room.number, room.name) && <span className="block truncate text-sm text-fg-muted">{room.name}</span>}
                  <span className="block text-sm text-fg-muted">{t(`kind.${room.kind}`)}</span>
                </th>
                {days.map((d) => (
                  <td key={d} className={cn("px-1.5 py-2", d === today && "bg-accent-soft/30")}>
                    {cell(room, d, "grid")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Phone: one day at a time */}
      <div className="mt-4 md:hidden">
        <DatePicker
          days={days.map((d) => ({ date: d, available: true }))}
          selected={selectedDay}
          onSelect={setSelectedDay}
          previousDisabled
          nextDisabled
        />
        <ul className="mt-4 flex flex-col gap-3">
          {activeRooms.map((room) => (
            <li key={room.id}>
              <Card padded={false} className="p-4">
                <p className="mb-3 flex items-baseline justify-between gap-2">
                  <span className="font-heading text-lg">
                    {t("roomNumber", { number: room.number })} <span className="text-base text-fg-muted">{roomExtraName(room.number, room.name)}</span>
                  </span>
                  <span className="text-sm text-fg-muted">{t(`kind.${room.kind}`)}</span>
                </p>
                {cell(room, selectedDay, "list")}
              </Card>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-fg-muted">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-4 w-6 rounded-xs border border-accent/30 bg-accent-soft" />
          {t("legendReserved")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-4 w-6 rounded-xs border border-dashed border-border-strong/60" />
          {t("legendFree")}
        </span>
        <span className="inline-flex items-center gap-2">
          <Icons.Repeat className="size-4" />
          {t("legendWeekly")}
        </span>
        <span className="inline-flex items-center gap-2">
          <Icons.Info className="size-4" />
          {t("privacy")}
        </span>
      </div>

      {openBlock && (
        <BlockSheet
          block={openBlock}
          room={rooms.find((r) => r.id === openBlock.roomId)}
          name={nameOf.get(openBlock.therapistId) ?? "?"}
          appointments={apptsInBlock(openBlock)}
          onClose={() => setOpenBlock(null)}
        />
      )}
      {openPrivate && (
        <PrivateDaySheet
          room={openPrivate.room}
          day={openPrivate.day}
          name={openPrivate.room.privateTherapistId ? nameOf.get(openPrivate.room.privateTherapistId) : undefined}
          appointments={apptsFor(openPrivate.room.id, openPrivate.day)}
          onClose={() => setOpenPrivate(null)}
        />
      )}
      {assigning && <AssignSheet {...assigning} therapists={therapists} onClose={() => setAssigning(null)} />}
    </>
  );
}

function BlockChip({ block, name, count, onOpen }: { block: RoomBlock; name: string; count: number; onOpen: () => void }) {
  const t = useTranslations("admin.grid");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[4.5rem] w-full flex-1 flex-col items-start rounded-sm border border-accent/30 bg-accent-soft px-2 py-1 text-left text-sm transition-colors duration-150 hover:border-accent"
    >
      <span className="flex w-full items-center gap-1">
        <span className="text-fg-muted tabular-nums">{localTime(block.period.start)}</span>
        {block.seriesId && (
          <>
            <Icons.Repeat className="ml-auto size-3.5 shrink-0 text-accent-strong" />
            <span className="sr-only">{t("weekly")}</span>
          </>
        )}
      </span>
      <span className="w-full truncate text-fg">{name}</span>
      <span className="text-fg-muted">{t("appointments", { count })}</span>
    </button>
  );
}

function AppointmentList({ appointments }: { appointments: Appointment[] }) {
  const t = useTranslations("admin.grid");
  const locale = useLocale() as Locale;
  if (appointments.length === 0) return <p className="text-sm text-fg-muted">{t("noAppointments")}</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {appointments
        .slice()
        .sort((a, b) => a.session.start.localeCompare(b.session.start))
        .map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="tabular-nums">
              {localTime(a.session.start)}–{localTime(a.session.end)}
            </span>
            <span className="min-w-0 flex-1 truncate">{a.snapshot.serviceName[locale]}</span>
            {a.status === "held" && <Badge tone="warning">{t("held")}</Badge>}
          </li>
        ))}
    </ul>
  );
}

function BlockSheet({
  block,
  room,
  name,
  appointments,
  onClose,
}: {
  block: RoomBlock;
  room?: Room;
  name: string;
  appointments: Appointment[];
  onClose: () => void;
}) {
  const t = useTranslations("admin.grid");
  const format = useFormatter();
  const { pending, exec } = useRunAction("admin");
  const [blocked, setBlocked] = useState(appointments.length > 0);
  const day = localDay(block.period.start);

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("blockTitle", { number: room?.number ?? "?", start: localTime(block.period.start), end: localTime(block.period.end) })}
      description={format.dateTime(dayToDate(day), { weekday: "long", day: "numeric", month: "long" })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("close")}
          </Button>
          <Button
            variant="secondary"
            disabled={pending || blocked}
            onClick={() =>
              exec(() => releaseBlockAsAdmin(block.id), {
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
            {t("release")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
          <dt className="text-fg-muted">{t("therapist")}</dt>
          <dd>{name}</dd>
          <dt className="text-fg-muted">{t("repeat")}</dt>
          <dd>{block.seriesId ? t("weekly") : t("oneOff")}</dd>
        </dl>
        {blocked && (
          <div role="status" className="flex items-start gap-3 rounded-md bg-warning-soft p-4 text-warning">
            <Icons.Alert className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">{t("hasBookingsTitle", { count: Math.max(1, appointments.length) })}</p>
              <p className="mt-1 text-sm">{t("hasBookingsText")}</p>
            </div>
          </div>
        )}
        <div>
          <h3 className="mb-2 text-base">{t("appointmentsTitle")}</h3>
          <AppointmentList appointments={appointments} />
        </div>
        {block.seriesId && <p className="text-sm text-fg-muted">{t("releaseOneNote")}</p>}
      </div>
    </Sheet>
  );
}

function PrivateDaySheet({
  room,
  day,
  name,
  appointments,
  onClose,
}: {
  room: Room;
  day: string;
  name?: string;
  appointments: Appointment[];
  onClose: () => void;
}) {
  const t = useTranslations("admin.grid");
  const format = useFormatter();
  return (
    <Sheet
      open
      onClose={onClose}
      title={t("privateTitle", { number: room.number, name: name ?? t("unassigned") })}
      description={format.dateTime(dayToDate(day), { weekday: "long", day: "numeric", month: "long" })}
    >
      <div className="flex flex-col gap-3 pb-4">
        <p className="text-sm text-fg-muted">{t("privateText")}</p>
        <AppointmentList appointments={appointments} />
      </div>
    </Sheet>
  );
}

function AssignSheet({ room, template, day, therapists, onClose }: Assigning & { therapists: Therapist[]; onClose: () => void }) {
  const t = useTranslations("admin.grid");
  const format = useFormatter();
  const { pending, exec } = useRunAction("admin");
  const [therapistId, setTherapistId] = useState("");
  const [weekly, setWeekly] = useState(false);
  const [taken, setTaken] = useState(false);
  const dayLabel = format.dateTime(dayToDate(day), { weekday: "long", day: "numeric", month: "long" });

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("assignTitle", { number: room.number, start: template.startTime, end: template.endTime })}
      description={dayLabel}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={pending || !therapistId}
            onClick={() =>
              exec(() => assignBlock({ roomId: room.id, therapistId, blockTemplateId: template.id, date: day, weekly }), {
                success: t("assigned"),
                onSuccess: onClose,
                onError: (r) => {
                  if (r.code === "block_taken") {
                    setTaken(true);
                    return true;
                  }
                },
              })
            }
          >
            {t("assign")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Select
          label={t("therapist")}
          placeholder={t("chooseTherapist")}
          value={therapistId}
          onChange={(e) => setTherapistId(e.target.value)}
          options={therapists.map((x) => ({ value: x.id, label: x.displayName }))}
        />
        <Checkbox
          label={t("weeklyLabel")}
          description={t("weeklyHint", { weekday: format.dateTime(dayToDate(day), { weekday: "long" }) })}
          checked={weekly}
          onChange={(e) => setWeekly(e.target.checked)}
        />
        {taken && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning">
            <Icons.Alert className="mt-0.5 size-4 shrink-0" />
            {t("takenText")}
          </p>
        )}
      </div>
    </Sheet>
  );
}
