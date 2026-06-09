import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { allowsSuperadminPanel } from "@/lib/saas-host-access";
import { getSiteIconForHost } from "@/lib/site-favicons";

function stripHost(host: string) {
  return host.split(":")[0]?.toLowerCase().replace(/^www\./, "") ?? "";
}

const FAVICON_PATHS = new Set([
  "/favicon.ico",
  "/icon",
  "/icon.png",
  "/apple-icon",
  "/apple-icon.png",
]);

/**
 * Panel superadmin solo en el dominio raíz del SaaS (ej. mezzi.app).
 * Subdominios (alcarbon.mezzi.app, urbrands.mezzi.app) y dominios custom de tenants
 * solo tienen login + panel /tenants.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") ?? "";

  // El navegador pide /favicon.ico antes que los <link> del metadata; Vercel
  // responde su icono por defecto si no reescribimos al logo del tenant.
  if (FAVICON_PATHS.has(pathname)) {
    const iconPath = getSiteIconForHost(host);
    const url = request.nextUrl.clone();
    url.pathname = iconPath;
    return NextResponse.rewrite(url);
  }

  if (!pathname.startsWith("/superadmin")) {
    return NextResponse.next();
  }

  if (allowsSuperadminPanel(stripHost(host))) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/tenants";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/superadmin/:path*",
    "/favicon.ico",
    "/icon",
    "/icon.png",
    "/apple-icon",
    "/apple-icon.png",
  ],
};
