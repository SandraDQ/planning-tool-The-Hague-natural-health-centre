import { Link } from "@/i18n/navigation";
import { Logo } from "./Logo";
import { cn } from "../utils";
import { siteWordmark } from "../site";

/**
 * The site's header brand: hummingbird logo + "NATURAL HEALTH CENTRE / THE HAGUE"
 * written beside it (on the current site this text is live text, not part of the image).
 * Links home. `size="lg"` is the desktop size of the current site (logo 72px high).
 */
export function BrandLink({ href = "/", size = "md", className }: { href?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const logoHeight = size === "lg" ? 72 : size === "md" ? 52 : 42;
  return (
    <Link href={href} className={cn("inline-flex min-h-11 min-w-0 shrink items-center gap-2 rounded-sm text-fg sm:gap-3", className)}>
      <Logo variant="mark" height={logoHeight} decorative />
      {/* On very narrow phones (< 380px) the name is visually hidden so the Book button fits; it stays the link's name. */}
      <span className="flex min-w-0 flex-col font-heading leading-none font-normal uppercase max-[379px]:sr-only">
        <span
          className={cn(
            "whitespace-nowrap",
            size === "lg"
              ? "text-[1.4375rem] tracking-[0.06em]"
              : size === "md"
                ? "text-lg tracking-[0.05em]"
                : "text-[0.8125rem] tracking-[0.01em]",
          )}
        >
          {siteWordmark.name}
        </span>
        <span
          className={cn(
            "mt-1.5 whitespace-nowrap text-fg-muted",
            size === "lg"
              ? "text-base tracking-[0.42em]"
              : size === "md"
                ? "text-sm tracking-[0.38em]"
                : "text-[0.6875rem] tracking-[0.3em]",
          )}
        >
          {siteWordmark.place}
        </span>
      </span>
    </Link>
  );
}
