import { cn } from "../utils";

/** Initials placeholder until real photos are available. Decorative: the name is always shown next to it. */
export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => w.length > 2 || w === w.toUpperCase())
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent-strong dark:text-accent",
        size === "sm" && "size-9 text-sm",
        size === "md" && "size-12 text-base",
        size === "lg" && "size-20 text-lg",
        className,
      )}
    >
      {initials}
    </span>
  );
}
