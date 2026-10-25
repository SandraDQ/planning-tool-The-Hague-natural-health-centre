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

/** Groups related content on a white surface with soft depth. */
export function Card<T extends ElementType = "div">({ as, padded = true, interactive, className, children, ...props }: CardProps<T>) {
  const Comp = (as ?? "div") as ElementType;
  return (
    <Comp
      className={cn(
        "rounded-lg border border-border bg-surface shadow-sm",
        padded && "p-5 sm:p-6",
        interactive &&
          "transition-[box-shadow,transform,border-color] duration-200 ease-calm hover:-translate-y-0.5 hover:border-border-strong/40 hover:shadow-md",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
