import type { CSSProperties } from "react";

/** Fallback brand accent when tenant has no primaryColor set. */
export const DEFAULT_PRIMARY = "#dc2626";
export const DEFAULT_SECONDARY = "#fef2f2";

export type TenantThemeColors = {
  primaryColor: string;
  secondaryColor: string;
};

/**
 * CSS custom properties for the tenants shell.
 * Soft/muted mixes live in globals.css (:root / .dark) so dark mode stays correct.
 */
export function tenantThemeCssVars(
  primaryColor: string,
  secondaryColor: string = DEFAULT_SECONDARY
): CSSProperties {
  return {
    "--primaryColor": primaryColor,
    "--primaryDark": `color-mix(in srgb, ${primaryColor} 78%, #1a1a2e)`,
    "--secondaryColor": secondaryColor,
  } as CSSProperties;
}

export function resolvePrimaryColor(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_PRIMARY;
}

export function resolveSecondaryColor(value?: string | null): string {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_SECONDARY;
}
