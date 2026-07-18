"use client";

import { SettingsField, settingsControlClass } from "./settings-field";
import { cn } from "@/lib/utils";

interface ColorFieldProps {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorField({
  id,
  label,
  description,
  value,
  onChange,
}: ColorFieldProps) {
  return (
    <SettingsField id={id} label={label} description={description}>
      <div className="flex items-center gap-2">
        <label
          htmlFor={`${id}-swatch`}
          className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border"
          title="Elegir color"
        >
          <span
            className="absolute inset-0"
            style={{ backgroundColor: value || "#dc2626" }}
          />
          <input
            id={`${id}-swatch`}
            type="color"
            value={value || "#dc2626"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className={cn(settingsControlClass, "font-mono uppercase")}
          placeholder="#DC2626"
        />
      </div>
    </SettingsField>
  );
}
