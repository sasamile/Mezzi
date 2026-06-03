/** Hosts con dominio dedicado (sin panel superadmin). Sin deps de Convex/metadata. */
export const DEDICATED_TENANT_HOSTS = [
  "alcarbon.mezzi.app",
  "urbrands.mezzi.app",
] as const;

export function isListedDedicatedHost(host: string): boolean {
  return (DEDICATED_TENANT_HOSTS as readonly string[]).includes(host);
}
