import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** Small footer on every mock-up: says the data is made up and links between previews. */
export function MockNote() {
  const t = useTranslations("design.mock");
  const pages = [
    { href: "/design", label: t("pages.showcase") },
    { href: "/design/home", label: t("pages.home") },
    { href: "/design/choose-time", label: t("pages.chooseTime") },
    { href: "/design/therapist-calendar", label: t("pages.calendar") },
  ];
  return (
    <footer className="border-t border-border py-6 text-sm text-fg-muted">
      <div className="mx-auto flex max-w-content flex-col px-gutter gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{t("note")}</p>
        <ul className="-mx-2 flex flex-wrap">
          {pages.map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="inline-flex min-h-11 items-center rounded-sm px-2 underline-offset-4 hover:text-fg hover:underline">
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
