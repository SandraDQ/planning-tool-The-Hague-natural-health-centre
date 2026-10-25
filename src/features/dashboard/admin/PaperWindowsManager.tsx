"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button, ButtonLink, Card, EmptyState, Icons, Notice, Select, Sheet, TextField, dayToDate, useToast } from "@/design-system";
import type { PaperWindow, Room, RoomBlock, Therapist } from "@/lib/domain/types";
import { PageHeading } from "../components/Page";
import { closePaperWindow, openPaperWindow } from "../actions/admin";
import { useRunAction } from "../useRunAction";
import { localDay, localTime, localToIso } from "../time";
import { roomTitle } from "../rooms";

type Props = {
  now: string;
  today: string;
  /** Windows that have not ended yet, sorted by start. */
  windows: PaperWindow[];
  therapists: Therapist[];
  rooms: Room[];
  /** Reserved blocks in the coming weeks: the places a window in a shared room can go. */
  blocks: RoomBlock[];
  /** Held or confirmed bookings per window id. */
  booked: Record<string, number>;
};

const STATUS_TONE = { open: "success", filled: "accent", closed: "neutral" } as const;

/**
 * Paper-calendar windows (3.5): for therapists who keep their own diary, the
 * admin opens the times in which clients can book them online.
 */
export function PaperWindowsManager({ now, today, windows, therapists, rooms, blocks, booked }: Props) {
  const t = useTranslations("admin.paper");
  const format = useFormatter();
  const toast = useToast();
  const { pending, exec } = useRunAction("admin");
  const [filter, setFilter] = useState("");
  const [opening, setOpening] = useState(false);
  const paperTherapists = therapists.filter((x) => x.paperCalendar).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const therapistById = new Map(therapists.map((x) => [x.id, x]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const roomLabel = (id: string) => {
    const r = roomById.get(id);
    return r ? roomTitle(r.number, r.name, t("roomNumber", { number: r.number })) : t("unknownRoom");
  };
  const shown = windows.filter((w) => !filter || w.therapistId === filter);

  return (
    <>
      <PageHeading
        title={t("title")}
        description={t("lead")}
        actions={
          paperTherapists.length > 0 && (
            <Button leadingIcon={<Icons.Plus />} onClick={() => setOpening(true)}>
              {t("open")}
            </Button>
          )
        }
      />

      {paperTherapists.length === 0 ? (
        <Card className="mt-8" padded={false}>
          <EmptyState
            icon={<Icons.CalendarIcon />}
            title={t("noTherapistsTitle")}
            description={t("noTherapistsText")}
            action={
              <ButtonLink href="/admin/renters" variant="secondary">
                {t("toRenters")}
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          {paperTherapists.length > 1 && (
            <Select
              className="max-w-xs"
              label={t("filter")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              options={[{ value: "", label: t("allTherapists") }, ...paperTherapists.map((x) => ({ value: x.id, label: x.displayName }))]}
            />
          )}
          <Card padded={false}>
            {shown.length === 0 ? (
              <EmptyState icon={<Icons.CalendarIcon />} title={t("emptyTitle")} description={t("emptyText")} />
            ) : (
              <ul className="divide-y divide-border">
                {shown.map((w) => {
                  const count = booked[w.id] ?? 0;
                  return (
                    <li key={w.id} className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="truncate text-base">
                          {format.dateTime(dayToDate(localDay(w.period.start)), { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                          <span className="tabular-nums">
                            {localTime(w.period.start)}–{localTime(w.period.end)}
                          </span>
                        </p>
                        <p className="truncate text-sm text-fg-muted">
                          {therapistById.get(w.therapistId)?.displayName ?? t("unknownTherapist")} · {roomLabel(w.roomId)}
                          {count > 0 && <> · {t("bookedCount", { count })}</>}
                        </p>
                      </div>
                      <Badge tone={STATUS_TONE[w.status]}>{t(`status.${w.status}`)}</Badge>
                      {w.status === "open" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending || count > 0}
                          aria-label={t("closeNamed", {
                            name: therapistById.get(w.therapistId)?.displayName ?? "",
                            time: `${localDay(w.period.start)} ${localTime(w.period.start)}`,
                          })}
                          onClick={() =>
                            exec(() => closePaperWindow(w.id), {
                              success: t("closed"),
                              onError: (r) => {
                                if (r.code !== "invalid") return false;
                                toast.show({ title: t("closeBooked"), tone: "danger" });
                                return true;
                              },
                            })
                          }
                        >
                          {t("close")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <p className="text-sm text-fg-muted">{t("closeHint")}</p>
        </div>
      )}

      {opening && (
        <OpenWindowSheet
          today={today}
          now={now}
          therapists={paperTherapists}
          initialTherapistId={filter || paperTherapists[0]?.id || ""}
          rooms={rooms}
          blocks={blocks}
          roomLabel={roomLabel}
          onClose={() => setOpening(false)}
        />
      )}
    </>
  );
}

type Place = { key: string; roomId: string; day: string | null; start: string; end: string; label: string };

function OpenWindowSheet({
  today,
  now,
  therapists,
  initialTherapistId,
  rooms,
  blocks,
  roomLabel,
  onClose,
}: {
  today: string;
  now: string;
  therapists: Therapist[];
  initialTherapistId: string;
  rooms: Room[];
  blocks: RoomBlock[];
  roomLabel: (id: string) => string;
  onClose: () => void;
}) {
  const t = useTranslations("admin.paper");
  const format = useFormatter();
  const { pending, exec } = useRunAction("admin");
  const [therapistId, setTherapistId] = useState(initialTherapistId);
  const [placeKey, setPlaceKey] = useState("");
  const [day, setDay] = useState(today);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [tried, setTried] = useState(false);

  // Where a window can go: inside one of the therapist's shared-room blocks, or any time in their private room.
  const places = useMemo<Place[]>(() => {
    const own: Place[] = blocks
      .filter((b) => b.therapistId === therapistId && roomById(rooms, b.roomId)?.kind === "shared")
      .sort((a, b) => a.period.start.localeCompare(b.period.start))
      .map((b) => ({
        key: b.id,
        roomId: b.roomId,
        day: localDay(b.period.start),
        start: localTime(b.period.start),
        end: localTime(b.period.end),
        label: `${format.dateTime(dayToDate(localDay(b.period.start)), { weekday: "short", day: "numeric", month: "short" })} · ${localTime(b.period.start)}–${localTime(b.period.end)} · ${roomLabel(b.roomId)}`,
      }));
    const privateRoom = rooms.find((r) => r.kind === "private" && r.active && r.privateTherapistId === therapistId);
    if (privateRoom) own.unshift({ key: `private:${privateRoom.id}`, roomId: privateRoom.id, day: null, start: "09:00", end: "12:00", label: t("privateRoom", { room: roomLabel(privateRoom.id) }) });
    return own;
  }, [blocks, rooms, therapistId, format, roomLabel, t]);

  const place = places.find((p) => p.key === placeKey) ?? null;
  const chooseTherapist = (id: string) => {
    setTherapistId(id);
    setPlaceKey("");
    setStart("");
    setEnd("");
  };
  const choosePlace = (key: string) => {
    setPlaceKey(key);
    const p = places.find((x) => x.key === key);
    if (!p) return;
    if (p.day) setDay(p.day);
    setStart(p.start);
    setEnd(p.end);
  };

  const effectiveDay = place?.day ?? day;
  const timesOk = /^\d\d:\d\d$/.test(start) && /^\d\d:\d\d$/.test(end) && end > start;
  const insideBlock = !place?.day || (start >= place.start && end <= place.end);
  const period = place && effectiveDay && timesOk ? { start: localToIso(effectiveDay, start), end: localToIso(effectiveDay, end) } : null;
  const future = !period || period.start > now;
  const valid = Boolean(therapistId && place && period && insideBlock && future);

  const submit = () => {
    setTried(true);
    if (!valid || !place || !period) return;
    exec(() => openPaperWindow({ therapistId, roomId: place.roomId, period }), { success: t("opened"), successText: t("openedText"), onSuccess: onClose });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("openTitle")}
      description={t("openText")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={pending || (tried && !valid)} onClick={submit}>
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Select label={t("therapist")} value={therapistId} onChange={(e) => chooseTherapist(e.target.value)} options={therapists.map((x) => ({ value: x.id, label: x.displayName }))} />
        {places.length === 0 ? (
          <Notice tone="warning" title={t("noPlacesTitle")}>
            {t("noPlacesText")}
          </Notice>
        ) : (
          <>
            <Select
              label={t("place")}
              value={placeKey}
              placeholder={t("placePlaceholder")}
              onChange={(e) => choosePlace(e.target.value)}
              options={places.map((p) => ({ value: p.key, label: p.label }))}
              hint={t("placeHint")}
              error={tried && !place ? t("placeError") : undefined}
            />
            {place && !place.day && <TextField label={t("date")} type="date" min={today} value={day} onChange={(e) => setDay(e.target.value)} />}
            {place && (
              <div className="grid grid-cols-2 gap-3">
                <TextField label={t("start")} type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
                <TextField
                  label={t("end")}
                  type="time"
                  step={300}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  error={
                    !timesOk && start && end
                      ? t("timeError")
                      : !insideBlock
                        ? t("outsideBlock", { start: place.start, end: place.end })
                        : !future
                          ? t("pastError")
                          : undefined
                  }
                />
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

function roomById(rooms: Room[], id: string) {
  return rooms.find((r) => r.id === id);
}
