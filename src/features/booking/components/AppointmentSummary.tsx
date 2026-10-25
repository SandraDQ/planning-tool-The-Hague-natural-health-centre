import type { ReactNode } from "react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar, Card, Icons } from "@/design-system";
import { TIME_ZONE } from "../time";

export type SummaryData = {
  therapistName: string;
  therapistPhoto?: string | null;
  serviceName: string;
  sessionTypeName: string;
  durationMin: number;
  priceCents: number;
  depositCents: number;
};

/** "Your appointment": who, what, when, where and what you pay. Usable on server and client. */
export function AppointmentSummary({
  data,
  start,
  paid,
  showNotes = true,
  footer,
  headingLevel = "h2",
}: {
  data: SummaryData;
  /** ISO start, or null while no time is chosen. */
  start: string | null;
  /** True once the deposit is paid. */
  paid?: boolean;
  showNotes?: boolean;
  footer?: ReactNode;
  headingLevel?: "h2" | "h3";
}) {
  const t = useTranslations("booking");
  const format = useFormatter();
  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });
  const balance = Math.max(0, data.priceCents - data.depositCents);
  const H = headingLevel;
  const when = start
    ? t("time.selected", {
        date: format.dateTime(new Date(start), { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE }),
        time: format.dateTime(new Date(start), { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE }),
      })
    : null;
  const subtitle = data.sessionTypeName && data.sessionTypeName !== data.serviceName ? `${data.serviceName} · ${data.sessionTypeName}` : data.serviceName;

  return (
    <Card className="flex flex-col gap-5" aria-labelledby="summary-title" role="region">
      <H id="summary-title" className="text-lg">
        {t("summary.title")}
      </H>
      <div className="flex items-center gap-3">
        {data.therapistPhoto ? (
          <Image src={data.therapistPhoto} alt="" width={48} height={48} unoptimized className="size-12 shrink-0 rounded-full object-cover" />
        ) : (
          <Avatar name={data.therapistName} />
        )}
        <div className="min-w-0">
          <p className="text-base font-bold">{data.therapistName}</p>
          <p className="text-sm text-fg-muted">{subtitle}</p>
        </div>
      </div>
      <dl className="flex flex-col gap-3 text-base">
        <div className="flex items-start gap-3">
          <Icons.Clock className="mt-0.5 size-5 shrink-0 text-fg-muted" />
          <dt className="sr-only">{t("summary.when")}</dt>
          <dd>
            <span className={when ? "block font-bold first-letter:uppercase" : "block text-fg-muted"}>{when ?? t("time.noTime")}</span>
            <span className="block text-sm text-fg-muted">{t("minutes", { minutes: data.durationMin })}</span>
          </dd>
        </div>
        <div className="flex items-start gap-3">
          <Icons.MapPin className="mt-0.5 size-5 shrink-0 text-fg-muted" />
          <dt className="sr-only">{t("summary.where")}</dt>
          <dd>{t("location")}</dd>
        </div>
      </dl>
      <dl className="flex flex-col gap-2 border-t border-border pt-4 text-base">
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">{t("summary.price")}</dt>
          <dd className="tabular-nums">{euro(data.priceCents)}</dd>
        </div>
        <div className="flex justify-between gap-4 font-bold">
          <dt>{paid ? t("summary.depositPaid") : t("summary.depositNow")}</dt>
          <dd className="tabular-nums">{euro(data.depositCents)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-fg-muted">{t("summary.balance")}</dt>
          <dd className="tabular-nums">{euro(balance)}</dd>
        </div>
      </dl>
      {showNotes && (
        <ul className="flex flex-col gap-2 rounded-md bg-surface-2 p-4 text-sm text-fg-muted">
          <li className="flex gap-2">
            <Icons.Check className="size-4 shrink-0 translate-y-0.5 text-success" />
            {t("summary.balanceNote")}
          </li>
          {!paid && (
            <li className="flex gap-2">
              <Icons.Check className="size-4 shrink-0 translate-y-0.5 text-success" />
              {t("summary.hold")}
            </li>
          )}
        </ul>
      )}
      {footer}
    </Card>
  );
}
