import Image from "next/image";
import { cn } from "@/design-system";
import { mediaSize, type ContentImage } from "@/content/media";

/**
 * A photo from public/media (the site's own images, copied from the Wix media backup).
 *
 * - default: shown at its own proportions, full width of its column.
 * - `fill`: covers a box whose size/aspect the caller sets with `className`
 *   (e.g. "aspect-square w-40 rounded-full"), like Wix's cropped image frames.
 */
export function SiteImage({
  image,
  sizes,
  fill,
  priority,
  className,
  imgClassName,
  position,
}: {
  image: ContentImage;
  sizes: string;
  fill?: boolean;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  /** object-position for `fill` (default centre, like Wix "al_c"). */
  position?: string;
}) {
  const size = mediaSize(image.src);
  if (!size) return null;
  if (fill) {
    return (
      // The frame is the positioning box for the image; keep a caller's `absolute` (cn does not merge classes).
      <div className={cn(!/\b(absolute|fixed)\b/.test(className ?? "") && "relative", "overflow-hidden bg-surface-2", className)}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={sizes}
          priority={priority}
          className={cn("object-cover", imgClassName)}
          style={position ? { objectPosition: position } : undefined}
        />
      </div>
    );
  }
  return (
    <Image
      src={image.src}
      alt={image.alt}
      width={size.width}
      height={size.height}
      sizes={sizes}
      priority={priority}
      className={cn("h-auto w-full", className, imgClassName)}
    />
  );
}
