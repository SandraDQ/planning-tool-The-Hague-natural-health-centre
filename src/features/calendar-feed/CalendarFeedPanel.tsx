import { getLocale, getTranslations } from "next-intl/server";
import { Button, Card, Icons, Notice, buttonClasses } from "@/design-system";
import type { Locale, Session } from "@/lib/domain/types";
import { feedLinks } from "@/lib/server/calendar-feed/links";
import { getStore } from "@/lib/server/data";
import { resetCalendarLink } from "./actions";
import { CopyLink } from "./CopyLink";

/**
 * Calendar subscribe link (7A, one-way): appointments and room blocks appear in Apple,
 * Google or Outlook. Big buttons per app, a copyable link, and a reset for a lost link.
 */
export async function CalendarFeedPanel({ session, status }: { session: Session; status?: string }) {
  const t = await getTranslations("calendarFeed");
  const locale = (await getLocale()) as Locale;
  const { subject, version } = await getStore().feeds.mine(session);
  const links = await feedLinks(subject, version, locale, subject.kind === "admin" ? t("nameAdmin") : t("name"));
  const external = { target: "_blank", rel: "noopener noreferrer" } as const;

  return (
    <div className="flex flex-col gap-6">
      {status === "reset" && <Notice tone="success" role="status" title={t("resetDone")} />}
      {status === "error" && <Notice tone="danger" role="alert" title={t("resetError")} />}

      <Card as="section" aria-labelledby="feed-add">
        <h2 id="feed-add" className="text-lg">
          {t("addTitle")}
        </h2>
        <p className="mt-2 text-lg">{subject.kind === "admin" ? t("introAdmin") : t("intro")}</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a href={links.webcal} className={buttonClasses({ size: "lg" })}>
            <Icons.CalendarIcon />
            {t("apple")}
          </a>
          <a href={links.google} {...external} className={buttonClasses({ variant: "secondary", size: "lg" })}>
            <Icons.ExternalLink />
            {t("google")}
          </a>
          <a href={links.outlook} {...external} className={buttonClasses({ variant: "secondary", size: "lg" })}>
            <Icons.ExternalLink />
            {t("outlook")}
          </a>
        </div>
        <p className="mt-4 text-base text-fg-muted">{t("delay")}</p>
      </Card>

      <Card as="section" aria-labelledby="feed-other">
        <h2 id="feed-other" className="text-lg">
          {t("otherTitle")}
        </h2>
        <p className="mt-2 text-lg">{t("otherText")}</p>
        <div className="mt-4">
          <CopyLink url={links.https} label={t("linkLabel")} copyLabel={t("copy")} copiedLabel={t("copied")} />
        </div>
        <p className="mt-4 text-base text-fg-muted">{subject.kind === "admin" ? t("privacyAdmin") : t("privacy")}</p>
      </Card>

      <Card as="section" aria-labelledby="feed-reset">
        <h2 id="feed-reset" className="text-lg">
          {t("resetTitle")}
        </h2>
        <p className="mt-2 text-lg">{t("resetText")}</p>
        <form action={resetCalendarLink} className="mt-4">
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="secondary">
            {t("resetButton")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
