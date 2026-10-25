import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "../utils";

type CardProps<T extends ElementType> = {
  as?: T;
  padded?: boolean;
  /** Adds hover lift for cards that are links or buttons. */
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentProps<T>, "as" | "className" | "children">;

/** Groups related content on a white surface with a thin sand line (flat, like the site). */
export function Card<T extends ElementType = "div">({ as, padded = true, interactive, className, children, ...props }: CardProps<T>) {
  const Comp = (as ?? "div") as ElementType;
  return (
    <Comp
      className={cn(
        "rounded-md border border-border bg-surface",
        padded && "p-5 sm:p-6",
        interactive &&
          "transition-[border-color,background-color] duration-200 ease-calm hover:border-sage hover:bg-surface-2/40",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
