import Image from "next/image";
import { useTranslations } from "next-intl";
import { brand } from "../brand";
import { cn } from "../utils";

/**
 * The centre's logo, used exactly as delivered (never redrawn, recoloured or cropped).
 * Until the original file is added (see src/design-system/brand.ts), a neutral,
 * clearly labelled placeholder holds its place.
 */
export function Logo({ height = 40, className }: { height?: number; className?: string }) {
  const t = useTranslations();
  if (brand.logo) {
    const width = Math.round((brand.logo.width / brand.logo.height) * height);
    return (
      <Image
        src={brand.logo.src}
        alt={t("common.centreName")}
        width={width}
        height={height}
        priority
        unoptimized
        className={cn("block h-auto max-w-none", className)}
        style={{ height, width }}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={t("design.ui.logoPlaceholder")}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xs border border-dashed border-border-strong text-sm font-medium tracking-wide text-fg-muted uppercase",
        className,
      )}
      style={{ height, aspectRatio: brand.placeholderAspectRatio }}
    >
      {t("design.ui.logoText")}
    </span>
  );
}
