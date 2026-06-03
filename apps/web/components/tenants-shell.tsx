"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { useQuery } from "convex/react";
import { api } from "@/convex";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { Id } from "@/convex";
import { getHostLogoSrc } from "@/lib/site-branding";
import { proxiedTenantAssetUrl } from "@/lib/tenant-asset-url";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  Mail,
  BookOpen,
  FileText,
  GraduationCap,
  CalendarDays,
  Truck,
  Headphones,
  Briefcase,
  User as UserIcon,
  Users,
  Link2,
  Utensils,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";

interface TenantsShellProps {
  children: ReactNode;
}

/** Colores neutros solo mientras carga; luego se usan los del tenant */
const LOADING_PRIMARY = "#64748b";
const LOADING_SECONDARY = "#94a3b8";

interface NavEntry {
  href: string;
  pageKey: string;
  Icon: LucideIcon;
  label: string;
  group: string;
  disabled?: boolean;
  disabledTitle?: string;
  /** Requiere este módulo habilitado. undefined = siempre visible */
  module?: "pqr" | "pedidos" | "reservas" | "conocimiento" | "trabajaConNosotros";
}

export function TenantsShell({ children }: TenantsShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { tenantId } = useTenant();
  const [collapsed, setCollapsed] = useState(false);

  const tenant = useQuery(
    api.tenants.get,
    tenantId ? { tenantId } : "skip"
  );
  const ycloud = useQuery(
    api.integrations.getYCloud,
    tenantId ? { tenantId } : "skip"
  );
  const needingAttention = useQuery(
    api.conversations.countNeedingAttention,
    tenantId && ycloud?.connected ? { tenantId } : "skip"
  );
  const membership = useQuery(
    api.users.getMembershipByTenantAndUser,
    tenantId && user?._id ? { tenantId, userId: user._id as Id<"users"> } : "skip"
  );

  const baseHref = "/tenants";

  // Solo mostrar loading en la carga inicial. Cuando actualiza/revalida, no volver a mostrar skeleton
  const hasLoadedTenantRef = useRef(false);
  const prevTenantIdRef = useRef<string | null>(null);
  const lastTenantRef = useRef<typeof tenant>(null);
  if (prevTenantIdRef.current !== tenantId) {
    prevTenantIdRef.current = tenantId ?? null;
    hasLoadedTenantRef.current = false;
    lastTenantRef.current = null;
  }
  if (tenant && tenantId) {
    hasLoadedTenantRef.current = true;
    lastTenantRef.current = tenant;
  }
  const isLoading = tenantId && tenant === undefined && !hasLoadedTenantRef.current;
  // Usar último tenant conocido durante revalidaciones para evitar parpadeos
  const displayTenant = tenant ?? (hasLoadedTenantRef.current ? lastTenantRef.current : null);

  const hostLogoSrc =
    typeof window !== "undefined" ? getHostLogoSrc(window.location.hostname) : undefined;
  const brandLogoSrc =
    (displayTenant?.logoUrl &&
      (proxiedTenantAssetUrl(displayTenant.logoUrl) ?? displayTenant.logoUrl)) ||
    hostLogoSrc;
  const hasBrandLogo = Boolean(brandLogoSrc);

  const ycloudConnected = ycloud?.connected ?? false;
  const primaryColor = isLoading ? LOADING_PRIMARY : (displayTenant?.primaryColor ?? LOADING_PRIMARY);
  const secondaryColor = isLoading ? LOADING_SECONDARY : (displayTenant?.secondaryColor ?? LOADING_SECONDARY);

  const cssVars = useMemo(
    () =>
      ({
        "--primaryColor": primaryColor,
        "--primaryLight": `color-mix(in srgb, ${primaryColor} 25%, white)`,
        "--primarySoft": `color-mix(in srgb, ${primaryColor} 12%, white)`,
        "--secondaryColor": secondaryColor,
        "--secondaryLight": `color-mix(in srgb, ${secondaryColor} 25%, white)`,
        "--secondarySoft": `color-mix(in srgb, ${secondaryColor} 12%, white)`,
      } as React.CSSProperties),
    [primaryColor, secondaryColor]
  );

  const isActive = (href: string) =>
    pathname === href || (href !== "/tenants" && pathname.startsWith(href));

  const modules = displayTenant?.enabledModules;
  const hasModule = (key: "pqr" | "pedidos" | "reservas" | "conocimiento" | "trabajaConNosotros") =>
    modules?.[key] !== false;

  const allowedPages = membership?.allowedPages;
  const hasPageAccess = (pageKey: string) => {
    // undefined o vacío = todas las páginas (retrocompatible)
    if (!allowedPages || allowedPages.length === 0) return true;
    return allowedPages.includes(pageKey);
  };

  const navEntries: NavEntry[] = [
    { href: "/tenants", pageKey: "dashboard", Icon: LayoutGrid, label: "Dashboard", group: "General" },
    {
      href: `${baseHref}/inbox`,
      pageKey: "inbox",
      Icon: Mail,
      label: "Inbox",
      group: "General",
      disabled: !tenantId || !ycloudConnected,
      disabledTitle: "Conecta YCloud en Integraciones",
    },
    {
      href: `${baseHref}/knowledge`,
      pageKey: "knowledge",
      Icon: BookOpen,
      label: "Conocimiento",
      group: "Conocimiento",
      module: "conocimiento" as const,
    },
    {
      href: `${baseHref}/menu`,
      pageKey: "menu",
      Icon: FileText,
      label: "Documentos PDF",
      group: "Conocimiento",
    },
    {
      href: `${baseHref}/aprendizaje`,
      pageKey: "aprendizaje",
      Icon: GraduationCap,
      label: "Aprendizaje",
      group: "Conocimiento",
      module: "conocimiento" as const,
    },
    {
      href: `${baseHref}/reservas`,
      pageKey: "reservas",
      Icon: CalendarDays,
      label: "Reservas",
      group: "General",
      module: "reservas" as const,
    },
    {
      href: `${baseHref}/solicitudes`,
      pageKey: "pedidos",
      Icon: Truck,
      label: "Pedidos",
      group: "General",
      module: "pedidos" as const,
    },
    {
      href: `${baseHref}/pqrs`,
      pageKey: "pqrs",
      Icon: Headphones,
      label: "PQRs",
      group: "General",
      module: "pqr" as const,
    },
    {
      href: `${baseHref}/trabaja-con-nosotros`,
      pageKey: "trabajaConNosotros",
      Icon: Briefcase,
      label: "Trabaja con Nosotros",
      group: "General",
      module: "trabajaConNosotros" as const,
    },
    {
      href: `${baseHref}/clientes`,
      pageKey: "clientes",
      Icon: UserIcon,
      label: "Clientes",
      group: "General",
    },
    {
      href: `${baseHref}/integraciones`,
      pageKey: "integraciones",
      Icon: Link2,
      label: "Integraciones",
      group: "Integraciones",
    },
    { href: `${baseHref}/users`, pageKey: "users", Icon: Users, label: "Usuarios", group: "Usuarios" },
  ].filter((e) => {
    if (!tenantId && e.group !== "General") return false;
    const m = e.module as "pqr" | "pedidos" | "reservas" | "conocimiento" | "trabajaConNosotros" | undefined;
    if (m && !hasModule(m)) return false;
    if (!hasPageAccess(e.pageKey)) return false;
    return true;
  });

  const groups = [...new Set(navEntries.map((e) => e.group))];

  return (
    <div
      className="flex h-screen overflow-hidden text-slate-800 font-(--font-jakarta)"
      style={{
        ...cssVars,
        background: "#f6f7f8",
      }}
    >
      {/* Sidebar */}
      <aside
        className={`
          shrink-0 flex flex-col overflow-hidden
          transition-all duration-300 ease-out m-3
          ${collapsed ? "w-[72px]" : "w-[240px]"}
        `}
        style={{
          background: "#fafbfc",
          border: "1px solid #e4e7eb",
          borderRadius: 16,
          boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.04)",
        }}
      >
        {/* Brand */}
        <div
          className={`shrink-0 border-b border-slate-100 px-3 pt-3 pb-3 ${collapsed ? "flex justify-center" : ""}`}
        >
          <Link
            href="/tenants"
            className={`block overflow-hidden rounded-lg transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] ${
              collapsed ? "size-15" : "h-13 w-full"
            }`}
            style={
              !hasBrandLogo
                ? {
                    background: `linear-gradient(135deg, var(--primaryColor), var(--primaryDark, color-mix(in srgb, var(--primaryColor) 75%, #1a1a2e)))`,
                    boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
                  }
                : undefined
            }
          >
            {isLoading ? (
              <span className="flex size-full items-center justify-center bg-slate-100">
                <Utensils size={18} strokeWidth={1.5} className="text-slate-400" />
              </span>
            ) : hasBrandLogo ? (
              <img
                src={brandLogoSrc}
                alt={displayTenant?.name ?? "Logo"}
                className={
                  collapsed
                    ? "size-full bg-slate-100 object-contain p-0.5"
                    : "size-full object-contain object-center"
                }
              />
            ) : (
              <span className="flex size-full items-center justify-center text-base font-bold text-white">
                {(displayTenant?.name ?? "·").charAt(0).toUpperCase()}
              </span>
            )}
          </Link>
        </div>

        {/* Navegación */}
        <nav className="flex-1 overflow-y-auto min-h-0 px-2.5 pb-2">
          {isLoading ? (
            <div className="flex flex-col gap-2 px-2 pt-2">
              <Skeleton className="h-8 w-full rounded-md" />
              <Skeleton className="h-8 w-full rounded-md" />
              <Skeleton className="h-8 w-full rounded-md" />
              <Skeleton className="h-6 w-3/4 rounded-md" />
              <Skeleton className="h-8 w-full rounded-md" />
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          ) : collapsed ? (
            <div className="flex flex-col gap-1 items-center pt-2">
              {navEntries.map((entry) => {
                const active = !entry.disabled && isActive(entry.href);
                const showBadge =
                  !entry.disabled &&
                  entry.href.includes("/inbox") &&
                  (needingAttention ?? 0) > 0;
                const iconBtn = (
                  <span
                    title={entry.disabled ? entry.disabledTitle : entry.label}
                    className={cn(
                      "relative size-10 rounded-xl flex items-center justify-center transition-all duration-150",
                      entry.disabled
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer active:scale-95",
                      !active && !entry.disabled && "hover:bg-white/60"
                    )}
                    style={
                      active
                        ? {
                            background: "rgba(255,255,255,0.95)",
                            border: "1px solid rgba(15,23,42,0.08)",
                            boxShadow:
                              "0 1px 2px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.7)",
                            color: "var(--primaryColor)",
                          }
                        : { color: "#64748b" }
                    }
                  >
                    <entry.Icon size={19} strokeWidth={1.7} />
                    {showBadge && (
                      <span
                        className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full grid place-items-center text-white text-[9px] font-bold tabular-nums"
                        style={{ background: "var(--primaryColor)" }}
                      >
                        {needingAttention}
                      </span>
                    )}
                  </span>
                );
                return entry.disabled ? (
                  <span key={entry.label}>{iconBtn}</span>
                ) : (
                  <Link key={entry.label} href={entry.href} className="flex justify-center">
                    {iconBtn}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-1 pt-3">
              {groups.map((group) => (
                <div key={group} className="flex flex-col">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-1.5 mt-2">
                    {group}
                  </p>
                  {navEntries
                    .filter((e) => e.group === group)
                    .map((entry) => {
                      const active = !entry.disabled && isActive(entry.href);
                      const showAttn =
                        !entry.disabled &&
                        entry.href.includes("/inbox") &&
                        (needingAttention ?? 0) > 0;
                      const content = (
                        <span
                          className={cn(
                            "relative flex items-center gap-3 py-2.5 px-3 mx-1.5 rounded-xl transition-all text-[13.5px]",
                            entry.disabled
                              ? "cursor-not-allowed opacity-60"
                              : "cursor-pointer",
                            !active && !entry.disabled && "hover:bg-white/60"
                          )}
                          style={
                            active
                              ? {
                                  background: "rgba(255,255,255,0.95)",
                                  border: "1px solid rgba(15,23,42,0.08)",
                                  boxShadow:
                                    "0 1px 2px rgba(15,23,42,0.05), 0 1px 3px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.7)",
                                  color: "#0f172a",
                                  fontWeight: 600,
                                }
                              : { color: "#475569" }
                          }
                        >
                          <entry.Icon
                            size={18}
                            strokeWidth={1.7}
                            className="shrink-0"
                            style={active ? { color: "var(--primaryColor)" } : undefined}
                          />
                          <span className="flex-1 truncate">{entry.label}</span>
                          {showAttn && (
                            <span
                              className="text-[10px] font-bold tabular-nums text-white rounded-full px-1.5 py-px"
                              style={{ background: "var(--primaryColor)" }}
                            >
                              {needingAttention}
                            </span>
                          )}
                          {entry.disabled && (
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              off
                            </span>
                          )}
                        </span>
                      );
                      return entry.disabled ? (
                        <span key={entry.label} title={entry.disabledTitle}>
                          {content}
                        </span>
                      ) : (
                        <Link key={entry.label} href={entry.href}>
                          {content}
                        </Link>
                      );
                    })}
                </div>
              ))}
            </div>
          )}
        </nav>

        {/* Bottom: usuario + toggle */}
        <div className="shrink-0 border-t border-slate-100">
          {/* Dropdown usuario */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-3 transition-colors hover:bg-slate-50",
                  collapsed && "justify-center"
                )}
              >
                <div
                  className="size-9 rounded-full grid place-items-center shrink-0 overflow-hidden text-white font-bold text-sm"
                  style={{
                    background: isLoading
                      ? "#e2e8f0"
                      : `linear-gradient(135deg, var(--primaryColor), var(--primaryDark, color-mix(in srgb, var(--primaryColor) 75%, #1a1a2e)))`,
                  }}
                >
                  {(user?.name ?? "U").charAt(0).toUpperCase()}
                </div>
                {!collapsed && (
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[13px] font-bold text-slate-900 truncate leading-tight">
                      {user?.name ?? "Usuario"}
                    </p>
                    <p className="text-[10.5px] text-slate-500 truncate mt-0.5">
                      {user?.email ?? ""}
                    </p>
                  </div>
                )}
                {!collapsed && (
                  <ChevronDown
                    size={16}
                    strokeWidth={1.7}
                    className="text-slate-400 shrink-0"
                  />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p className="font-semibold">{user?.name ?? "Usuario"}</p>
                <p className="text-xs font-normal text-slate-500">{user?.email ?? ""}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  href={tenantId ? `${baseHref}/ajustes` : baseHref}
                  className="cursor-pointer"
                >
                  <Settings size={16} strokeWidth={1.5} className="mr-2" />
                  Ajustes
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600 cursor-pointer"
                onSelect={() => {
                  logout();
                  router.push("/login");
                }}
              >
                <LogOut size={16} strokeWidth={1.5} className="mr-2" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Toggle colapsar */}
          <button
            type="button"
            onClick={() => setCollapsed((x) => !x)}
            className="flex items-center justify-center gap-2 w-full py-2 text-slate-400 hover:bg-slate-50 transition-colors border-t border-slate-100"
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            <ChevronLeft
              size={16}
              strokeWidth={1.7}
              className={cn("transition-transform duration-200", collapsed && "rotate-180")}
            />
            {!collapsed && (
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Colapsar
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* Main - área de contenido */}
      <main className="flex-1 my-3 mr-3 ml-0 flex flex-col overflow-hidden min-w-0">
        <div
          className="flex flex-1 min-h-0 flex-col overflow-hidden bg-white"
          style={{
            border: "1px solid #e4e7eb",
            borderRadius: 16,
            boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.04)",
          }}
        >
          {isLoading ? (
            <div className="flex flex-1 flex-col overflow-y-auto p-6 sm:p-8 md:p-10">
              <div className="mx-auto w-full max-w-6xl space-y-8">
                <div className="space-y-3">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-4 w-96" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-28 rounded-2xl" />
                  ))}
                </div>
                <div className="grid gap-8 lg:grid-cols-3">
                  <div className="space-y-4 lg:col-span-2">
                    <Skeleton className="h-48 rounded-2xl" />
                    <Skeleton className="h-36 rounded-2xl" />
                  </div>
                  <div className="space-y-4">
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-48 rounded-2xl" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}
