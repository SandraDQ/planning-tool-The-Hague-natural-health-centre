import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "./Logo";
import { openingHours, siteContact, siteLegal, siteSocial } from "../site";
import { cn } from "../utils";

const linkClass =
  "inline-flex min-h-11 items-center text-fg underline decoration-1 underline-offset-4 transition-colors duration-150 hover:text-accent-strong";

/**
 * The public website's footer, as on the current site: full logo, opening hours,
 * contact details, social links, copyright line and privacy link.
 * Content comes from src/design-system/site.ts (from the Wix export).
 */
export function SiteFooter({ className }: { className?: string }) {
  const t = useTranslations("design.site.footer");
  return (
    <footer className={cn("bg-sand text-fg", className)}>
      <div className="mx-auto grid max-w-content gap-10 px-gutter pt-12 pb-8 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1.3fr_1fr] lg:gap-12 lg:pt-16">
        <Link href="/" className="inline-flex self-start rounded-sm sm:col-span-2 lg:col-span-1">
          <Logo variant="full" height={151} />
        </Link>

        <section aria-labelledby="footer-hours">
          <h2 id="footer-hours" className="mb-3 text-lg">
            {t("openingHours")}
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
            {openingHours.map((d) => (
              <div key={d.day} className="contents">
                <dt>{t(`days.${d.day}`)}</dt>
                <dd className={cn(d.hours ? "tabular-nums" : "text-fg-muted")}>{d.hours ?? t(d.note ?? "closed")}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="footer-contact">
          <h2 id="footer-contact" className="mb-3 text-lg">
            {t("contact")}
          </h2>
          <address className="flex flex-col not-italic">
            <span>{siteContact.name}</span>
            <a href={siteContact.mapUrl} className={linkClass} rel="noopener" target="_blank">
              {siteContact.address}
            </a>
            <a href={siteContact.emailHref} className={cn(linkClass, "break-all")}>
              {siteContact.email}
            </a>
            <span>
              <a href={siteContact.phoneHref} className={linkClass}>
                {siteContact.phone}
              </a>{" "}
              <span className="text-fg-muted">({t("phoneNote")})</span>
            </span>
          </address>
          <Link href="/contact" className={cn(linkClass, "mt-2")}>
            {t("sendMessage")}
          </Link>
        </section>

        <section aria-labelledby="footer-social">
          <h2 id="footer-social" className="mb-3 text-lg">
            {t("social")}
          </h2>
          <ul className="flex flex-col">
            {siteSocial.map((s) => (
              <li key={s.name}>
                <a
                  href={s.href}
                  className="group flex min-h-11 flex-col justify-center py-1 text-fg transition-colors duration-150 hover:text-accent-strong"
                  rel="noopener"
                  target="_blank"
                >
                  <span className="underline decoration-1 underline-offset-4">{s.name}</span>
                  <span className="text-sm break-all text-fg-muted">{s.handle}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mx-auto max-w-content px-gutter">
        <div className="flex flex-col gap-1 border-t border-border-strong/40 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            <Link href="/" className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4">
              {siteLegal.copyright}
            </Link>
            <span className="text-fg-muted"> | {siteLegal.credit}</span>
          </p>
          <Link
            href={siteLegal.privacy}
            className="inline-flex min-h-11 items-center underline decoration-1 underline-offset-4 hover:text-accent-strong"
          >
            {t("privacy")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
