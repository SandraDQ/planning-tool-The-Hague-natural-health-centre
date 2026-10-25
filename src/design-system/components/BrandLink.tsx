import { Link } from "@/i18n/navigation";
import { Logo } from "./Logo";
import { cn } from "../utils";
import { siteWordmark } from "../site";

/**
 * The site's header brand, as on the live site: the hummingbird with
 * "THE HAGUE" (small, widely spaced) above "NATURAL HEALTH CENTRE", both in brand
 * green in the condensed light face. On the live site this is live text, not part of the image.
 * Links home. `size="lg"` is the desktop size of the live site (logo 72px high).
 */
export function BrandLink({ href = "/", size = "md", className }: { href?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const logoHeight = size === "lg" ? 72 : size === "md" ? 56 : 46;
  return (
    <Link
      href={href}
      className={cn("inline-flex min-h-11 min-w-0 shrink items-center gap-1 rounded-sm text-accent sm:gap-2", className)}
    >
      <Logo variant="mark" height={logoHeight} decorative />
      {/* On very narrow phones (< 340px) the name is visually hidden so the Book button fits; it stays the link's name. */}
      <span className="flex min-w-0 flex-col items-center pt-1 font-display leading-none font-extralight uppercase max-[339px]:sr-only">
        <span
          className={cn(
            "whitespace-nowrap",
            size === "lg"
              ? "text-base tracking-[0.25em]"
              : size === "md"
                ? "text-[0.9375rem] tracking-[0.25em]"
                : "text-[0.6875rem] tracking-[0.25em]",
          )}
        >
          {siteWordmark.place}
        </span>
        <span
          className={cn(
            "mt-1 whitespace-nowrap",
            size === "lg" ? "text-[1.4375rem]" : size === "md" ? "text-[1.3125rem]" : "text-[1.0625rem]",
          )}
        >
          {siteWordmark.name}
        </span>
      </span>
    </Link>
  );
}
