import type { Metadata } from "next";
import { fetchTenantByHost } from "@/lib/fetch-tenant-by-host";
import { normalizeHost } from "@/lib/normalize-host";
import { proxiedTenantAssetUrl } from "@/lib/tenant-asset-url";

export type LoginSidePanel = "image" | "dashed-grid";

export type LoginBranding = {
  logoSrc: string;
  logoAlt: string;
  subtitle: string;
  sideImageSrc: string;
  sideImageAlt: string;
  /** Panel derecho del login en desktop */
  sidePanel: LoginSidePanel;
};

type HostBrandingOverride = {
  title: string;
  description: string;
  icon: string;
  login?: Partial<Omit<LoginBranding, "sidePanel">> & { sidePanel?: LoginSidePanel };
};

const DEFAULT_LOGIN: LoginBranding = {
  logoSrc: "/logos/mezzi.svg",
  logoAlt: "Logo Mezzi",
  subtitle: "Ingresa tus credenciales para continuar.",
  sideImageSrc: "/login.png",
  sideImageAlt: "Imagen de acceso Mezzi",
  sidePanel: "image",
};

const SAAS_METADATA = {
  title: "Restaurantes SaaS | Panel Superadmin",
  description:
    "Panel Superadmin para gestionar restaurantes, planes, administradores y permisos.",
  icon: "/logos/mezzi.icon.svg",
};

/** Overrides por host cuando aún no hay tenant en BD o para assets extra (ej. imagen lateral login). */
const HOST_OVERRIDES: Record<string, HostBrandingOverride> = {
  "alcarbon.mezzi.app": {
    title: "Al Carbón | Panel",
    description: "Panel de administración de Al Carbón.",
    icon: "/logos/logoalcarbo.svg",
    login: {
      logoSrc: "/logos/logoalcarbo.svg",
      logoAlt: "Logo Al Carbón",
      sidePanel: "dashed-grid",
    },
  },
};

function stripHostHeader(host: string) {
  return normalizeHost(host);
}

export function isPrimarySaaSHost(host: string): boolean {
  const h = stripHostHeader(host);
  if (!h) return true;

  const saasHost = process.env.NEXT_PUBLIC_SAAS_HOST?.trim();
  if (saasHost) {
    const primary = stripHostHeader(saasHost);
    if (primary && h === primary) return true;
  }

  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app");
}

function tenantIcon(logoUrl?: string | null): string {
  const proxied = proxiedTenantAssetUrl(logoUrl ?? undefined);
  if (proxied) return proxied;
  if (logoUrl?.trim()) return logoUrl.trim();
  return SAAS_METADATA.icon;
}

function metadataFromParts(parts: {
  title: string;
  description: string;
  icon: string;
}): Metadata {
  return {
    title: parts.title,
    description: parts.description,
    icons: { icon: parts.icon },
  };
}

export function getLoginBranding(
  rawHost: string,
  tenant?: { name: string; logoUrl?: string | null } | null
): LoginBranding {
  const host = stripHostHeader(rawHost);
  const override = host ? HOST_OVERRIDES[host] : undefined;

  if (tenant) {
    const logo =
      proxiedTenantAssetUrl(tenant.logoUrl) ??
      tenant.logoUrl?.trim() ??
      override?.login?.logoSrc ??
      DEFAULT_LOGIN.logoSrc;
    return {
      logoSrc: logo,
      logoAlt: override?.login?.logoAlt ?? `Logo ${tenant.name}`,
      subtitle: override?.login?.subtitle ?? DEFAULT_LOGIN.subtitle,
      sideImageSrc: override?.login?.sideImageSrc ?? DEFAULT_LOGIN.sideImageSrc,
      sideImageAlt: override?.login?.sideImageAlt ?? DEFAULT_LOGIN.sideImageAlt,
      sidePanel: override?.login?.sidePanel ?? DEFAULT_LOGIN.sidePanel,
    };
  }

  if (override) {
    return {
      ...DEFAULT_LOGIN,
      logoSrc: override.login?.logoSrc ?? override.icon,
      logoAlt: override.login?.logoAlt ?? override.title.split("|")[0]?.trim() ?? DEFAULT_LOGIN.logoAlt,
      ...override.login,
    };
  }

  return DEFAULT_LOGIN;
}

export async function resolveSiteMetadata(rawHost: string): Promise<Metadata> {
  const host = stripHostHeader(rawHost);

  if (!host || isPrimarySaaSHost(host)) {
    return metadataFromParts(SAAS_METADATA);
  }

  const tenant = await fetchTenantByHost(host);
  if (tenant) {
    return metadataFromParts({
      title: `${tenant.name} | Panel`,
      description: `Panel de administración de ${tenant.name}.`,
      icon: tenantIcon(tenant.logoUrl),
    });
  }

  const override = HOST_OVERRIDES[host];
  if (override) {
    return metadataFromParts(override);
  }

  return metadataFromParts({
    title: "Restaurantes | Panel",
    description: "Panel de administración.",
    icon: SAAS_METADATA.icon,
  });
}
