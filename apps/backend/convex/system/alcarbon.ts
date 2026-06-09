import type { Doc } from "../_generated/dataModel";

/** Dominio dedicado del tenant Al Carbón. */
export const ALCARBON_DOMAIN = "alcarbon.mezzi.app";

export function normalizeHost(value?: string | null): string | null {
  if (!value) return null;
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split(":")[0] || null
  );
}

export function isAlcarbonTenant(
  tenant: Doc<"tenants"> | null | undefined
): boolean {
  if (!tenant) return false;
  if (normalizeHost(tenant.customDomain) === ALCARBON_DOMAIN) return true;
  return /al carb[oó]n/i.test(tenant.name);
}

/** PDFs desactivados por defecto en Al Carbón; superadmin puede activarlos explícitamente. */
export function isPdfsModuleEnabled(
  tenant: Doc<"tenants"> | null | undefined
): boolean {
  if (!tenant) return true;
  if (isAlcarbonTenant(tenant)) return tenant.enabledModules?.pdfs === true;
  return tenant.enabledModules?.pdfs !== false;
}
