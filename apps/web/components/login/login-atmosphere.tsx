"use client";

type LoginAtmosphereProps = {
  accentColor?: string;
  className?: string;
};

/** Fondo calmado para login: atmósfera + grid sutil (sin look de plantilla). */
export function LoginAtmosphere({
  accentColor = "#dc2626",
  className,
}: LoginAtmosphereProps) {
  return (
    <div className={className} aria-hidden>
      <div className="absolute inset-0 bg-[#0c0c0d]" />
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% -10%, ${accentColor}33 0%, transparent 55%),
            radial-gradient(ellipse 60% 40% at 80% 100%, ${accentColor}14 0%, transparent 50%),
            radial-gradient(ellipse 50% 35% at 10% 80%, #27272a 0%, transparent 55%)
          `,
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 40%, #000 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 60% at 50% 40%, #000 20%, transparent 75%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0c0c0d] to-transparent" />
    </div>
  );
}
