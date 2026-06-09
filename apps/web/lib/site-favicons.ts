import { normalizeHost } from "@/lib/normalize-host";

const DEFAULT_FAVICON = "/logos/mezzi.icon.svg";

/** Favicon estático por host dedicado (sin deps de Convex — safe para middleware edge). */
const HOST_FAVICONS: Record<string, string> = {
  "alcarbon.mezzi.app": "/logos/logoalcarbo.svg",
  "urbrands.mezzi.app": "/logos/urbrands.png",
};

export function getSiteIconForHost(rawHost: string): string {
  const host = normalizeHost(rawHost);
  if (!host) return DEFAULT_FAVICON;
  return HOST_FAVICONS[host] ?? DEFAULT_FAVICON;
}

export { DEFAULT_FAVICON };
