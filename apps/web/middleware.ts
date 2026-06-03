import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { allowsSuperadminPanel } from "@/lib/saas-host-access";

function stripHost(host: string) {
  return host.split(":")[0]?.toLowerCase().replace(/^www\./, "") ?? "";
}

/**
 * Panel superadmin solo en el dominio raíz del SaaS (ej. mezzi.app).
 * Subdominios (alcarbon.mezzi.app, urbrands.mezzi.app) y dominios custom de tenants
 * solo tienen login + panel /tenants.
 */
export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/superadmin")) {
    return NextResponse.next();
  }

  const host = stripHost(request.headers.get("host") ?? "");
  if (allowsSuperadminPanel(host)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/tenants";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/superadmin/:path*"],
};
