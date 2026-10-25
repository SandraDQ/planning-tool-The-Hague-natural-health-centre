import { useTranslations } from "next-intl";
import { ButtonLink, EmptyState, Icons } from "@/design-system";

/** Shown when the data layer cannot be reached. Never a stack trace. */
export function BookingUnavailable() {
  const t = useTranslations("booking.unavailable");
  return (
    <div className="mx-auto max-w-reading px-gutter py-16">
      <h1 className="sr-only">{t("title")}</h1>
      <EmptyState
        icon={<Icons.CalendarIcon />}
        title={t("title")}
        description={t("text")}
        action={<ButtonLink href="/contact">{t("contact")}</ButtonLink>}
      />
    </div>
  );
}
