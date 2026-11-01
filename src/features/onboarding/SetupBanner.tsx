import { getTranslations } from "next-intl/server";
import { ButtonLink, Notice } from "@/design-system";
import type { Session } from "@/lib/domain/types";
import { therapistSetup } from "./setup";

/** On the therapist's home screen until the setup steps are done (8B). */
export async function SetupBanner({ session }: { session: Session }) {
  const { done, total } = await therapistSetup(session);
  if (done >= total) return null;
  const t = await getTranslations("setup");
  return (
    <Notice
      tone="info"
      title={t("bannerTitle", { done, total })}
      action={
        <ButtonLink href="/therapist/setup" size="lg">
          {t("bannerButton")}
        </ButtonLink>
      }
    >
      <span className="text-lg">{t("bannerText")}</span>
    </Notice>
  );
}
