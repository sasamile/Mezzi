"use client";

const GRID_BASE_STYLE: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(to right, #e7e5e4 1px, transparent 1px),
    linear-gradient(to bottom, #e7e5e4 1px, transparent 1px)
  `,
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 0",
  maskComposite: "intersect",
  WebkitMaskComposite: "source-in",
};

const MASK_REPEAT = `
  repeating-linear-gradient(
    to right,
    black 0px,
    black 3px,
    transparent 3px,
    transparent 8px
  ),
  repeating-linear-gradient(
    to bottom,
    black 0px,
    black 3px,
    transparent 3px,
    transparent 8px
  ),
`;

const TOP_FADE_MASK = `${MASK_REPEAT}
  radial-gradient(ellipse 70% 60% at 50% 0%, #000 60%, transparent 100%)`;

const BOTTOM_FADE_MASK = `${MASK_REPEAT}
  radial-gradient(ellipse 100% 80% at 50% 100%, #000 50%, transparent 90%)`;

export type DashedGridFade = "top" | "bottom";

type DashedGridBackgroundProps = {
  fade: DashedGridFade;
  className?: string;
};

export function DashedGridBackground({ fade, className }: DashedGridBackgroundProps) {
  const mask = fade === "top" ? TOP_FADE_MASK : BOTTOM_FADE_MASK;

  return (
    <div
      className={className}
      style={{
        ...GRID_BASE_STYLE,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
      aria-hidden
    />
  );
}

/** Mañana/tarde: fade arriba; tarde-noche/madrugada: fade abajo. */
export function dashedGridFadeForHour(hour: number): DashedGridFade {
  return hour >= 6 && hour < 18 ? "top" : "bottom";
}
