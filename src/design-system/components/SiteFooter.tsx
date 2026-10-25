import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "./Button";
import { Logo } from "./Logo";
import { openingHours, siteContact, siteLegal, siteSocial } from "../site";
import { cn } from "../utils";

const linkClass =
  "inline-flex min-h-11 items-center text-accent decoration-1 underline-offset-4 transition-colors duration-150 hover:text-accent-strong hover:underline";

/**
 * The public website's footer, as on the live site: white, a thin line on top,
 * everything in brand green. Full logo, opening hours ("Monday appointment only"),
 * contact details with a "Send us a message" button, social links underneath,
 * and one centred line with copyright, credit and privacy. Centred on phones, as on the site.
 * Content comes from src/design-system/site.ts (from the Wix export).
 */
export function SiteFooter({ className }: { className?: string }) {
  const t = useTranslations("design.site.footer");
  return (
    <footer className={cn("bg-canvas text-accent", className)}>
      <div className="mx-auto max-w-[82.5rem] px-gutter">
        <div className="grid gap-10 border-t border-border-strong/40 pt-10 pb-12 text-center sm:grid-cols-2 sm:text-left lg:grid-cols-[1fr_1.4fr_1.9fr] lg:gap-12">
          <Link href="/" className="inline-flex self-start justify-self-center rounded-sm sm:col-span-2 sm:justify-self-start lg:col-span-1 lg:justify-self-center">
            <Logo variant="full" height={151} />
          </Link>

          <section aria-labelledby="footer-hours">
            <h2 id="footer-hours" className="mb-3 font-sans text-lg font-light">
              {t("openingHours")}
            </h2>
            <ul className="font-heading text-base leading-[1.8] font-light">
              {openingHours.map((d) => (
                <li key={d.day}>
                  {t(`days.${d.day}`)} <span className={cn(d.hours && "tabular-nums")}>{d.hours ?? t(d.note ?? "closed")}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="flex flex-col gap-8">
            <section aria-labelledby="footer-contact">
              <h2 id="footer-contact" className="mb-3 font-sans text-lg font-light">
                {t("contact")}
              </h2>
              <address className="flex flex-col items-center text-base leading-[1.8] font-light not-italic sm:items-start">
                <span>{siteContact.name}</span>
                <a href={siteContact.mapUrl} className={cn(linkClass, "lg:min-h-0")} rel="noopener" target="_blank">
                  {siteContact.address}
                </a>
                <a href={siteContact.emailHref} className={cn(linkClass, "break-all lg:min-h-0")}>
                  {siteContact.email}
                </a>
                <span>
                  <a href={siteContact.phoneHref} className={cn(linkClass, "lg:min-h-0")}>
                    {siteContact.phone}
                  </a>{" "}
                  ({t("phoneNote")})
                </span>
              </address>
              <Link href="/contact" className={buttonClasses({ size: "sm", className: "mt-4 font-light" })}>
                {t("sendMessage")}
              </Link>
            </section>

            <section aria-labelledby="footer-social">
              <h2 id="footer-social" className="mb-2 font-sans text-base font-light">
                {t("social")}
              </h2>
              <ul className="flex flex-col items-center sm:items-start">
                {siteSocial.map((s) => (
                  <li key={s.name}>
                    <a
                      href={s.href}
                      className="inline-flex min-h-11 items-center font-light break-all text-accent underline decoration-1 underline-offset-4 transition-colors duration-150 hover:text-accent-strong sm:min-h-9"
                      rel="noopener"
                      target="_blank"
                    >
                      {s.name} {s.handle}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <p className="flex flex-wrap items-center justify-center gap-x-2 pb-6 text-center text-sm font-light">
          <Link href="/" className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4">
            {siteLegal.copyright}
          </Link>
          <span aria-hidden="true">|</span>
          <span>{siteLegal.credit}</span>
          <span aria-hidden="true">|</span>
          <Link href={siteLegal.privacy} className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4">
            {t("privacy")}
          </Link>
        </p>
      </div>
    </footer>
  );
}
