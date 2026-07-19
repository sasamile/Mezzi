"use client";

type LoginAtmosphereProps = {
  accentColor?: string;
  className?: string;
};

/** Fondo del login: atmósfera + grid sutil, respeta light/dark. */
export function LoginAtmosphere({
  accentColor = "#dc2626",
  className,
}: LoginAtmosphereProps) {
  return (
    <div className={className} aria-hidden>
      <div className="absolute inset-0 bg-background" />
      <div
        className="absolute inset-0 opacity-60 dark:opacity-55"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% -10%, ${accentColor}28 0%, transparent 55%),
            radial-gradient(ellipse 60% 40% at 80% 100%, ${accentColor}12 0%, transparent 50%)
          `,
        }}
      />
      <div
        className="absolute inset-0 opacity-40 dark:opacity-[0.35]"
        style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          color: "color-mix(in oklab, var(--foreground) 6%, transparent)",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 40%, #000 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 40%, #000 20%, transparent 75%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-background to-transparent" />
    </div>
  );
}
