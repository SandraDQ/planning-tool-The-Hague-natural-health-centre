import { useTranslations } from "next-intl";
import { ButtonLink, Icons } from "@/design-system";
import { PageHeading } from "../components/Page";

/** Back to the settings list + the page title (one topic per screen, 8A). */
export function SettingsHeader({ title, description }: { title: string; description?: string }) {
  const t = useTranslations("therapist.settings");
  return (
    <>
      <ButtonLink href="/therapist/settings" variant="ghost" size="sm" leadingIcon={<Icons.ChevronLeft />} className="mb-2 -ml-3">
        {t("back")}
      </ButtonLink>
      <PageHeading title={title} description={description} />
    </>
  );
}
