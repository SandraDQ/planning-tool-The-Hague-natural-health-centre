import { useTranslations } from "next-intl";
import { cn } from "@/design-system";

/** Neutral stand-in until real photos of the centre arrive (MASTER_PROMPT 8A: real photos only). */
export function PhotoPlaceholder({ className, label }: { className?: string; label?: string }) {
  const t = useTranslations("design.mock");
  return (
    <div
      role="img"
      aria-label={label ?? t("photo")}
      className={cn("flex items-center justify-center bg-sand p-4 text-center text-sm text-fg-muted", className)}
    >
      {label ?? t("photo")}
    </div>
  );
}
