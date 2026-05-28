import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex";
import { normalizeHost } from "@/lib/normalize-host";

let client: ConvexHttpClient | null = null;

export async function fetchTenantByHost(rawHost: string) {
  const host = normalizeHost(rawHost);
  if (!host) return null;

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!convexUrl) return null;

  if (!client) client = new ConvexHttpClient(convexUrl);

  try {
    return await client.query(api.tenants.getByHost, { host });
  } catch {
    return null;
  }
}
