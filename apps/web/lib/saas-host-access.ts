import { isListedDedicatedHost } from "@/lib/dedicated-tenant-hosts";
import { normalizeHost } from "@/lib/normalize-host";

const DEV_SUPERADMIN_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Dominio raíz del SaaS (panel superadmin). Por defecto mezzi.app */
export function getSaasRootHost(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SAAS_HOST?.trim();
  return normalizeHost(fromEnv) || "mezzi.app";
}

/** Host de restaurante / tenant: subdominios mezzi.app, overrides o dominio custom. */
export function isDedicatedTenantHost(rawHost: string): boolean {
  const host = normalizeHost(rawHost);
  if (!host) return false;

  if (DEV_SUPERADMIN_HOSTS.has(host) || host.endsWith(".vercel.app")) {
    return false;
  }

  const root = getSaasRootHost();
  if (host === root) return false;

  if (isListedDedicatedHost(host)) return true;

  if (host.endsWith(`.${root}`)) return true;

  if (process.env.NEXT_PUBLIC_SAAS_HOST?.trim()) {
    return true;
  }

  return host !== root;
}

/** Panel superadmin solo en mezzi.app (o localhost en dev), nunca en subdominios tenant. */
export function allowsSuperadminPanel(rawHost: string): boolean {
  const host = normalizeHost(rawHost);
  if (!host) return true;

  if (isDedicatedTenantHost(host)) return false;

  if (DEV_SUPERADMIN_HOSTS.has(host) || host.endsWith(".vercel.app")) {
    return true;
  }

  return host === getSaasRootHost();
}
