import { cn } from "@/lib/utils";

interface BrandPreviewProps {
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
}

/** Vista previa calmada de cómo se ve la marca en la app. */
export function BrandPreview({
  name,
  primaryColor,
  secondaryColor,
  logoUrl,
}: BrandPreviewProps) {
  const primary = primaryColor || "#dc2626";
  const soft = `${primary}18`;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <div
          className="grid size-9 place-items-center overflow-hidden rounded-lg text-xs font-bold text-white"
          style={{
            background: logoUrl
              ? undefined
              : `linear-gradient(135deg, ${primary}, ${secondaryColor || primary})`,
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="size-full object-contain bg-muted p-0.5"
            />
          ) : (
            (name || "R").charAt(0).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {name || "Tu restaurante"}
          </p>
          <p className="text-xs text-muted-foreground">Vista previa</p>
        </div>
        <span
          className="hidden rounded-md px-2.5 py-1 text-[11px] font-semibold text-white sm:inline"
          style={{ backgroundColor: primary }}
        >
          Acción
        </span>
      </div>
      <div className="flex items-center gap-2 px-4 py-3">
        <span
          className={cn(
            "inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium"
          )}
          style={{ backgroundColor: soft, color: primary }}
        >
          Activo
        </span>
        <span className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
          Secundario
        </span>
        <span
          className="ml-auto size-2.5 rounded-full"
          style={{ backgroundColor: secondaryColor || primary }}
          title="Color secundario"
        />
      </div>
    </div>
  );
}
