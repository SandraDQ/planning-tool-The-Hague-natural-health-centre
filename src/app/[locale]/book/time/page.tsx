import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Notice } from "@/design-system";
import { redirect } from "@/i18n/navigation";
import { BookingLayout } from "@/features/booking/components/BookingLayout";
import { FocusOnMount } from "@/features/booking/components/FocusOnMount";
import { TimeStep } from "@/features/booking/components/TimeStep";
import { BookingUnavailable } from "@/features/booking/components/Unavailable";
import { asLocale, bookingMetadata, safeCatalog } from "@/features/booking/server/pages";
import { slotsByDay, type DaySlots } from "@/features/booking/server/slots";
import { addDays, isDay, localDay, mondayOf, weekDays } from "@/features/booking/time";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ st?: string; week?: string; day?: string; taken?: string }>;
};

/** How far ahead the week strip goes. The store's booking window decides which of these days have times. */
const MAX_WEEKS_AHEAD = 26;
/** On first load, look this far ahead for the first week with a free time. */
const FIRST_FREE_SEARCH_WEEKS = 8;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = asLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "booking.time" });
  return bookingMetadata(locale, `${t("title")} | The Hague Natural Health Centre`);
}

/** Step 2: choose a time. */
export default async function BookTimePage({ params, searchParams }: Props) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("booking.time");
  const catalog = await safeCatalog(locale);
  if (!catalog) return <BookingUnavailable />;
  const entry = sp.st ? catalog.bySessionType.get(sp.st) : undefined;
  if (!entry) redirect({ href: "/book", locale });
  const { item, therapist } = entry!;

  const thisMonday = mondayOf(localDay(Date.now()));
  const lastMonday = addDays(thisMonday, 7 * MAX_WEEKS_AHEAD);
  let week = isDay(sp.week) ? mondayOf(sp.week) : null;
  if (week && (week < thisMonday || week > lastMonday)) week = null;

  let slots: DaySlots;
  try {
    if (week) {
      slots = await slotsByDay(item.sessionTypeId, week, addDays(week, 7));
    } else {
      // First visit: open on the first week that has a free time.
      const ahead = await slotsByDay(item.sessionTypeId, thisMonday, addDays(thisMonday, 7 * FIRST_FREE_SEARCH_WEEKS));
      const first = Object.keys(ahead).sort()[0];
      week = first ? mondayOf(first) : thisMonday;
      const end = addDays(week, 7);
      slots = Object.fromEntries(Object.entries(ahead).filter(([d]) => d >= week! && d < end));
    }
  } catch (err) {
    console.error("[booking] findSlots failed", (err as Error)?.message);
    return <BookingUnavailable />;
  }

  const days = weekDays(week);
  const wanted = isDay(sp.day) && days.includes(sp.day) && slots[sp.day]?.length ? sp.day : null;
  const initialDay = wanted ?? days.find((d) => slots[d]?.length) ?? days[0];
  const href = (w: string) => `/book/time?st=${encodeURIComponent(item.sessionTypeId)}&week=${w}`;

  return (
    <BookingLayout step="time" back={`/book/therapist/${therapist.slug}`} title={t("title")}>
      {sp.taken === "1" && (
        <FocusOnMount>
          <Notice tone="warning" role="alert" title={t("takenTitle")}>
            {t("takenText")}
          </Notice>
        </FocusOnMount>
      )}
      <TimeStep
        key={week}
        sessionTypeId={item.sessionTypeId}
        days={days}
        slots={slots}
        initialDay={initialDay}
        previousWeekHref={week > thisMonday ? href(addDays(week, -7)) : null}
        nextWeekHref={week < lastMonday ? href(addDays(week, 7)) : null}
        summary={{
          therapistName: therapist.displayName,
          therapistPhoto: therapist.photoUrl,
          serviceName: item.serviceName,
          sessionTypeName: item.sessionTypeName,
          durationMin: item.durationMin,
          priceCents: item.priceCents,
          depositCents: item.depositCents,
        }}
      />
    </BookingLayout>
  );
}
