import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "../utils";

export type SiteSectionTone = "plain" | "cream" | "sand" | "stone" | "linen" | "sage" | "accent";

const toneClasses: Record<SiteSectionTone, string> = {
  plain: "bg-canvas text-fg",
  cream: "bg-surface-2 text-fg",
  sand: "bg-sand text-fg",
  stone: "bg-stone text-fg",
  linen: "bg-linen text-fg",
  // White on sage is 3.3:1: only large text (>= 24px) may sit directly on it.
  sage: "bg-sage text-on-sage",
  accent: "bg-accent text-on-accent",
};

const widthClasses = {
  site: "max-w-site", // the current site's 980px column
  content: "max-w-content",
  reading: "max-w-reading",
  wide: "max-w-[82.5rem]", // the live site's 1320px wide boxes (quote, newsletter, map)
} as const;

/**
 * A full-width band of a public page with a centred content column, like the
 * sections ("strips") of the current Wix site. Use one tone per band; the
 * site alternates plain white with cream, sand, sage and green bands.
 */
export function SiteSection<T extends ElementType = "section">({
  as,
  tone = "plain",
  width = "site",
  padded = true,
  className,
  innerClassName,
  children,
  ...props
}: {
  as?: T;
  tone?: SiteSectionTone;
  width?: keyof typeof widthClasses;
  /** Vertical padding (the site uses generous space between bands). */
  padded?: boolean;
  className?: string;
  innerClassName?: string;
  children?: ReactNode;
} & Omit<ComponentProps<T>, "as" | "className" | "children">) {
  const Comp = (as ?? "section") as ElementType;
  return (
    <Comp className={cn(toneClasses[tone], className)} {...props}>
      <div className={cn("mx-auto px-gutter", widthClasses[width], padded && "py-14 sm:py-20", innerClassName)}>{children}</div>
    </Comp>
  );
}

/**
 * The site's page and section titles ("THERAPIES", "NATURE INSPIRED HEALTHCARE",
 * "ACCESSIBLE TO ALL"): condensed extra-light display face, uppercase, widely spaced.
 * - tone "taupe" (default): the live site's #9f8c82, 26–36px, large text only (3.2:1).
 * - tone "accent": brand green; "muted": the darker brown, for titles on sand/stone bands where taupe
 *   is too light (taupe on sand is 2.5:1); "inherit": current colour (e.g. white on a photo or green band).
 * - size "title" (default) = 26–36px like the site; "lg" = the hero size.
 * - caps={false} for the few titles the site writes in normal case ("Privacy", "Sustainable Living").
 */
export function DisplayHeading({
  as: Comp = "h2",
  tone = "taupe",
  size = "title",
  caps = true,
  className,
  children,
  ...props
}: {
  as?: "h1" | "h2" | "h3" | "p";
  tone?: "taupe" | "accent" | "muted" | "inherit";
  size?: "title" | "lg";
  caps?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<"h2">, "className" | "children">) {
  return (
    <Comp
      className={cn(
        "font-display font-extralight",
        caps && "uppercase",
        size === "lg" ? "text-2xl tracking-[0.04em]" : "text-title tracking-[0.1em]",
        tone === "taupe" ? "text-taupe" : tone === "accent" ? "text-accent" : tone === "muted" ? "text-fg-muted" : "text-current",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
