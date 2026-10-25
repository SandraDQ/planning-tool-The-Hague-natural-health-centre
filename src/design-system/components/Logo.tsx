import Image from "next/image";
import { useTranslations } from "next-intl";
import { brand, type LogoAsset } from "../brand";
import { cn } from "../utils";

/**
 * The centre's logo, used exactly as delivered (never redrawn, recoloured,
 * re-cropped or filtered; files are served as-is, `unoptimized`).
 *
 * - variant "mark": the hummingbird, as in the site header.
 * - variant "full": the full logo with name, as in the site footer. Shown in the
 *   same frame the site uses (a CSS window over the untouched file).
 *
 * `height` is the rendered height in CSS pixels. Pass `decorative` when the
 * centre's name is already written next to the logo (e.g. in the header).
 */
export function Logo({
  variant = "mark",
  height = 40,
  decorative,
  className,
}: {
  variant?: "mark" | "full";
  height?: number;
  decorative?: boolean;
  className?: string;
}) {
  const t = useTranslations("common");
  const asset: LogoAsset = variant === "full" ? brand.full : brand.mark;
  const alt = decorative ? "" : t("centreName");
  const frame = asset.frame ?? { x: 0, y: 0, width: asset.width, height: asset.height };
  const scale = height / frame.height;
  const boxWidth = Math.round(frame.width * scale);
  const imgWidth = Math.round(asset.width * scale);
  const imgHeight = Math.round(asset.height * scale);

  if (!asset.frame) {
    return (
      <Image
        src={asset.src}
        alt={alt}
        width={imgWidth}
        height={imgHeight}
        priority={variant === "mark"}
        unoptimized
        className={cn("block max-w-none shrink-0", className)}
        style={{ height: imgHeight, width: imgWidth }}
      />
    );
  }

  return (
    // In dark mode the full logo sits on a light plate (its outlines are dark); the file is unchanged.
    <span className="block shrink-0 dark:rounded-md dark:bg-logo-plate dark:p-3">
      <span
        className={cn("relative block shrink-0 overflow-hidden", className)}
        style={{ width: boxWidth, height }}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
      >
        <Image
          src={asset.src}
          alt=""
          width={imgWidth}
          height={imgHeight}
          unoptimized
          className="absolute block max-w-none"
          style={{
            width: imgWidth,
            height: imgHeight,
            left: -Math.round(frame.x * scale),
            top: -Math.round(frame.y * scale),
          }}
        />
      </span>
    </span>
  );
}
