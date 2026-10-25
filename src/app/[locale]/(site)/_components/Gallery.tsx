"use client";

import { useRef } from "react";
import { Icons, cn } from "@/design-system";
import type { ContentImage } from "@/content/media";
import { SiteImage } from "./SiteImage";

/**
 * The live site's photo slider: round photos in a row with arrows left and right.
 * Here it is a swipeable strip (CSS scroll-snap); the arrows scroll it by one photo.
 * `variant="round"` = 271px circles (About us), `"square"` = 271px squares.
 */
export function Gallery({
  images,
  label,
  prevLabel,
  nextLabel,
  variant = "round",
}: {
  images: ContentImage[];
  label: string;
  prevLabel: string;
  nextLabel: string;
  variant?: "round" | "square";
}) {
  const ref = useRef<HTMLUListElement>(null);
  const scroll = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const item = el.querySelector("li");
    el.scrollBy({ left: dir * ((item?.clientWidth ?? 280) + 12), behavior: "smooth" });
  };
  const arrow =
    "absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full text-surface transition-colors hover:bg-fg/15 sm:inline-flex [&_svg]:size-8 [&_svg]:drop-shadow";
  return (
    <div className="relative mx-auto max-w-[73.5rem]">
      <button type="button" onClick={() => scroll(-1)} aria-label={prevLabel} className={cn(arrow, "left-1")}>
        <Icons.ChevronLeft />
      </button>
      <ul
        ref={ref}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-gutter [scrollbar-width:none] sm:px-14"
      >
        {images.map((img, i) => (
          <li key={`${img.src}-${i}`} className="w-[16.9rem] shrink-0 snap-center sm:snap-start">
            <SiteImage
              image={img}
              sizes="271px"
              fill
              className={cn("aspect-square w-full", variant === "round" && "rounded-full")}
            />
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => scroll(1)} aria-label={nextLabel} className={cn(arrow, "right-1")}>
        <Icons.ChevronRight />
      </button>
    </div>
  );
}
