"use client";

import { cn } from "@/lib/utils";
import { avatarColorFor } from "@/lib/avatar-color";

/**
 * Avatar por defecto de WhatsApp (default-contact-refreshed de Meta).
 * SVG exacto del cliente de WhatsApp — portado desde Fincasya.
 */
export function DefaultContactSvg({
  fill = "#8a9399",
  className,
}: {
  fill?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <path
        fill={fill}
        d="M24 23q-1.86 0-3.18-1.32T19.5 18.5t1.32-3.18T24 14t3.18 1.32q1.32 1.32 1.32 3.18t-1.32 3.18T24 23m-6.75 10q-.93 0-1.59-.66T15 30.75v-.9q0-.96.5-1.76a3.3 3.3 0 0 1 1.3-1.22 16.7 16.7 0 0 1 3.54-1.3q1.8-.44 3.66-.44t3.66.43 3.54 1.31q.82.42 1.3 1.22t.5 1.76v.9q0 .93-.66 1.59t-1.59.66z"
      />
    </svg>
  );
}

export function ContactAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const dim =
    size === "xs"
      ? "size-7"
      : size === "sm"
        ? "size-8"
        : size === "lg"
          ? "size-11"
          : "size-9";
  const { bg, fg } = avatarColorFor(name || "?");

  return (
    <div
      title={name}
      className={cn("shrink-0 overflow-hidden rounded-full", dim, className)}
      style={{ backgroundColor: bg }}
    >
      <DefaultContactSvg fill={fg} className="h-full w-full" />
    </div>
  );
}
