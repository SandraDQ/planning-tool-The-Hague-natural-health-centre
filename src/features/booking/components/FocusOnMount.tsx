"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Moves focus (and the view) to a message that appears after a redirect, e.g.
 * "Someone just took this time", so it is seen on a phone and read out by screen readers.
 */
export function FocusOnMount({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, []);
  return (
    <div ref={ref} tabIndex={-1} className="outline-none">
      {children}
    </div>
  );
}
