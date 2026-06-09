/** Dominio dedicado del tenant Al Carbón. */
export const ALCARBON_DOMAIN = "alcarbon.mezzi.app";

export function isAlcarbonHost(rawHost?: string | null): boolean {
  if (!rawHost) return false;
  const host = rawHost
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0];
  return host === ALCARBON_DOMAIN;
}

export function isAlcarbonTenantIdentity(opts: {
  customDomain?: string | null;
  name?: string | null;
}): boolean {
  if (opts.customDomain && isAlcarbonHost(opts.customDomain)) return true;
  return /al carb[oó]n/i.test(opts.name ?? "");
}

/** PDFs desactivados por defecto en Al Carbón; superadmin puede activarlos explícitamente. */
export function isPdfsModuleEnabled(
  enabledModules?: { pdfs?: boolean } | null,
  tenant?: { customDomain?: string | null; name?: string | null } | null,
  host?: string | null
): boolean {
  const isAlcarbon =
    isAlcarbonHost(host) ||
    isAlcarbonTenantIdentity({
      customDomain: tenant?.customDomain,
      name: tenant?.name,
    });
  if (isAlcarbon) return enabledModules?.pdfs === true;
  return enabledModules?.pdfs !== false;
}
