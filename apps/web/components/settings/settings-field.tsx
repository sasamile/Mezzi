import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const settingsControlClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-none transition-colors placeholder:text-muted-foreground focus-visible:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export const settingsTextareaClass =
  "min-h-[88px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground shadow-none transition-colors placeholder:text-muted-foreground focus-visible:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

interface SettingsFieldProps {
  id: string;
  label: string;
  description?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function SettingsField({
  id,
  label,
  description,
  error,
  required,
  children,
  className,
}: SettingsFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-muted-foreground"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
