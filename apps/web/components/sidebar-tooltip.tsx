"use client";

import {
  useCallback,
  useId,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface SidebarTooltipProps {
  label: string;
  children: ReactNode;
  className?: string;
  side?: "right" | "top";
}

/** Tooltip del rail colapsado — portal para no recortarse con overflow del aside. */
export function SidebarTooltip({
  label,
  children,
  className,
  side = "right",
}: SidebarTooltipProps) {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const show = useCallback(
    (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      if (side === "right") {
        setCoords({
          top: r.top + r.height / 2,
          left: r.right + 10,
        });
      } else {
        setCoords({
          top: r.top - 8,
          left: r.left + r.width / 2,
        });
      }
      setOpen(true);
    },
    [side]
  );

  const hide = useCallback(() => setOpen(false), []);

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={hide}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={hide}
      aria-describedby={open ? tipId : undefined}
    >
      {children}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            id={tipId}
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-200 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md",
              side === "right" && "-translate-y-1/2",
              side === "top" && "-translate-x-1/2 -translate-y-full"
            )}
            style={{ top: coords.top, left: coords.left }}
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  );
}
