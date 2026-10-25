import { useTranslations } from "next-intl";
import { cn } from "@/design-system";

/** Neutral stand-in until real photos of the centre arrive (MASTER_PROMPT 8A: real photos only). */
export function PhotoPlaceholder({ className }: { className?: string }) {
  const t = useTranslations("design.mock");
  return (
    <div
      role="img"
      aria-label={t("photo")}
      className={cn("flex items-center justify-center rounded-lg border border-border bg-surface-2 text-sm text-fg-muted", className)}
    >
      {t("photo")}
    </div>
  );
}
