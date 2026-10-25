import type { ComponentProps, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Icons, ProgressSteps } from "@/design-system";
import { Link } from "@/i18n/navigation";

export const BOOKING_STEPS = ["choose", "time", "details", "pay"] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

/**
 * Frame of every booking screen: back link, progress, title and intro, the
 * step's content and (from lg) a summary column. Mobile-first: the summary
 * follows the content on phones.
 */
export function BookingLayout({
  step,
  back,
  title,
  intro,
  aside,
  children,
}: {
  step?: BookingStep;
  back?: ComponentProps<typeof Link>["href"];
  title: ReactNode;
  intro?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("booking");
  const steps = BOOKING_STEPS.map((s) => t(`steps.${s}`));
  return (
    <div className="mx-auto max-w-content px-gutter pt-4 pb-12 sm:pt-6 lg:pb-20">
      {back ? (
        <Link
          href={back}
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-sm px-2 text-base text-accent transition-colors duration-150 hover:bg-accent-soft"
        >
          <Icons.ChevronLeft className="size-5" />
          {t("back")}
        </Link>
      ) : (
        <div className="h-11" aria-hidden="true" />
      )}
      {step && <ProgressSteps steps={steps} current={BOOKING_STEPS.indexOf(step)} className="mt-3 max-w-2xl" />}

      <div className={aside ? "mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10" : "mt-8"}>
        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <h1 id="page-title" className="text-xl">
              {title}
            </h1>
            {intro && <p className="mt-2 text-base text-fg-muted">{intro}</p>}
          </div>
          {children}
        </div>
        {aside && <aside className="lg:sticky lg:top-6 lg:self-start">{aside}</aside>}
      </div>
    </div>
  );
}
