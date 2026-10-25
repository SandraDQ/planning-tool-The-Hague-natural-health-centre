import type { ComponentProps } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Icons } from "@/design-system";
import { Link } from "@/i18n/navigation";
import { TIME_ZONE } from "../time";
import type { SummaryData } from "./AppointmentSummary";

/** Phones: what you are booking in two lines at the top of the step, with a way to change the time. */
export function CompactSummary({
  data,
  start,
  changeHref,
  paid,
}: {
  data: SummaryData;
  start: string;
  changeHref?: ComponentProps<typeof Link>["href"];
  paid?: boolean;
}) {
  const t = useTranslations("booking");
  const format = useFormatter();
  const d = new Date(start);
  const when = t("time.selected", {
    date: format.dateTime(d, { weekday: "short", day: "numeric", month: "short", timeZone: TIME_ZONE }),
    time: format.dateTime(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE }),
  });
  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-surface-2 p-4 lg:hidden">
      <Icons.CalendarIcon className="mt-0.5 size-5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold first-letter:uppercase">{when}</p>
        <p className="text-sm text-fg-muted">
          {data.serviceName} · {data.therapistName} · {t("minutes", { minutes: data.durationMin })}
        </p>
        <p className="text-sm text-fg-muted">
          {paid ? t("summary.depositPaid") : t("summary.depositNow")} {euro(data.depositCents)} · {t("summary.balance")}{" "}
          {euro(Math.max(0, data.priceCents - data.depositCents))}
        </p>
      </div>
      {changeHref && (
        <Link href={changeHref} className="-my-2 -mr-2 inline-flex min-h-11 shrink-0 items-center rounded-sm px-2 text-base text-accent underline-offset-4 hover:underline">
          {t("change")}
        </Link>
      )}
    </div>
  );
}
