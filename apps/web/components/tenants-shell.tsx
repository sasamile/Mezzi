"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
import { isPdfsModuleEnabled } from "@/lib/alcarbon";
import {
  DEFAULT_SECONDARY,
  resolvePrimaryColor,
  resolveSecondaryColor,
  tenantThemeCssVars,
} from "@/lib/tenant-theme";
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
  Flame,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronDown,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarTooltip } from "@/components/sidebar-tooltip";

interface TenantsShellProps {
  children: ReactNode;
}

interface NavEntry {
  href: string;
  pageKey: string;
  Icon: LucideIcon;
  label: string;
  group: string;
  disabled?: boolean;
  disabledTitle?: string;
  module?: "pqr" | "pedidos" | "reservas" | "conocimiento" | "trabajaConNosotros" | "pdfs";
}

export function TenantsShell({ children }: TenantsShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { tenantId } = useTenant();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  const tenant = useQuery(api.tenants.get, tenantId ? { tenantId } : "skip");
  const ycloud = useQuery(
    api.integrations.getYCloud,
    tenantId ? { tenantId } : "skip"
  );
  const needingAttention = useQuery(
    api.conversations.countNeedingAttention,
    tenantId && ycloud?.connected
      ? { tenantId, userId: (user?._id as Id<"users">) ?? undefined }
      : "skip"
  );
  const membership = useQuery(
    api.users.getMembershipByTenantAndUser,
    tenantId && user?._id
      ? { tenantId, userId: user._id as Id<"users"> }
      : "skip"
  );

  const baseHref = "/tenants";
  const isInbox = pathname.startsWith(`${baseHref}/inbox`);

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
  const isLoading =
    Boolean(tenantId) && tenant === undefined && !hasLoadedTenantRef.current;
  const displayTenant =
    tenant ?? (hasLoadedTenantRef.current ? lastTenantRef.current : null);

  const ycloudConnected = ycloud?.connected ?? false;
  const primaryColor = isLoading
    ? "#94a3b8"
    : resolvePrimaryColor(displayTenant?.primaryColor);
  const secondaryColor = isLoading
    ? DEFAULT_SECONDARY
    : resolveSecondaryColor(displayTenant?.secondaryColor);
  const brandName = displayTenant?.name?.trim() || "Tenant";
  const brandSubtitle = "Panel";

  const cssVars = useMemo(
    () => tenantThemeCssVars(primaryColor, secondaryColor),
    [primaryColor, secondaryColor]
  );

  const isActive = (href: string) =>
    pathname === href || (href !== "/tenants" && pathname.startsWith(href));

  const modules = displayTenant?.enabledModules;
  const host =
    typeof window !== "undefined" ? window.location.hostname : undefined;
  const hasModule = (
    key: "pqr" | "pedidos" | "reservas" | "conocimiento" | "trabajaConNosotros" | "pdfs"
  ) => {
    if (key === "pdfs") {
      return isPdfsModuleEnabled(modules, displayTenant, host);
    }
    return modules?.[key] !== false;
  };

  const isOwner = membership?.role === "OWNER";
  const allowedPages = membership?.allowedPages;
  const hasPageAccess = (pageKey: string) => {
    if (!allowedPages || allowedPages.length === 0) return true;
    return allowedPages.includes(pageKey);
  };

  const navEntries: NavEntry[] = (
    [
    {
      href: "/tenants",
      pageKey: "dashboard",
      Icon: LayoutGrid,
      label: "Dashboard",
      group: "General",
    },
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
      module: "pdfs" as const,
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
    {
      href: `${baseHref}/users`,
      pageKey: "users",
      Icon: Users,
      label: "Usuarios",
      group: "Usuarios",
    },
  ] as NavEntry[]
  ).filter((e) => {
    if (!tenantId && e.group !== "General") return false;
    if (e.module && !hasModule(e.module)) return false;
    if (!hasPageAccess(e.pageKey)) return false;
    // Solo el propietario ve Usuarios e Integraciones
    if (
      (e.pageKey === "users" || e.pageKey === "integraciones") &&
      !isOwner
    ) {
      return false;
    }
    return true;
  });

  const groups = [...new Set(navEntries.map((e) => e.group))];

  const brandBlock = (compact: boolean) => (
    <Link
      href="/tenants"
      onClick={() => setMobileNavOpen(false)}
      title={brandName}
      className={cn(
        "flex items-center overflow-hidden rounded-xl transition-colors",
        compact
          ? "mx-auto size-10 justify-center hover:bg-muted"
          : "w-full gap-3 px-2 py-1.5 hover:bg-muted"
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-[10px] shadow-sm",
          compact ? "size-8" : "size-9"
        )}
        style={{ backgroundColor: primaryColor }}
        aria-hidden
      >
        <Flame
          size={compact ? 16 : 18}
          strokeWidth={2}
          className="text-white"
        />
      </span>
      {!compact && (
        <span className="min-w-0 flex-1 text-left leading-tight">
          <span className="block truncate text-sm font-medium text-foreground">
            {isLoading ? "…" : brandName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {brandSubtitle}
          </span>
        </span>
      )}
    </Link>
  );

  const iconNav = (
    <div className="flex flex-col items-center gap-1 pt-2">
      {navEntries.map((entry) => {
        const active = !entry.disabled && isActive(entry.href);
        const showBadge =
          !entry.disabled &&
          entry.href.includes("/inbox") &&
          (needingAttention ?? 0) > 0;
        const tip = entry.disabled
          ? (entry.disabledTitle ?? entry.label)
          : entry.label;
        const iconBtn = (
          <span
            className={cn(
              "relative flex size-10 items-center justify-center rounded-xl transition-colors duration-150",
              entry.disabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer",
              active
                ? "bg-(--primarySoft) text-(--primaryColor)"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <entry.Icon size={19} strokeWidth={1.7} />
            {showBadge && (
              <span
                className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-0.5 text-[9px] font-bold tabular-nums text-white"
                style={{ background: "var(--primaryColor)" }}
              >
                {needingAttention}
              </span>
            )}
          </span>
        );
        return entry.disabled ? (
          <SidebarTooltip key={entry.label} label={tip}>
            {iconBtn}
          </SidebarTooltip>
        ) : (
          <SidebarTooltip key={entry.label} label={tip}>
            <Link
              href={entry.href}
              className="flex justify-center"
              onClick={() => setMobileNavOpen(false)}
              aria-label={entry.label}
            >
              {iconBtn}
            </Link>
          </SidebarTooltip>
        );
      })}
    </div>
  );

  const labelNav = (
    <div className="flex flex-col gap-1 pt-3">
      {groups.map((group) => (
        <div key={group} className="flex flex-col">
          <p className="mb-1.5 mt-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                    "relative mx-1.5 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors duration-150",
                    entry.disabled
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer",
                    active
                      ? "bg-(--primarySoft) font-semibold text-foreground ring-1 ring-(--primaryColor)/10"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <entry.Icon
                    size={18}
                    strokeWidth={1.7}
                    className="shrink-0"
                    style={
                      active ? { color: "var(--primaryColor)" } : undefined
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {showAttn && (
                    <span
                      className="rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums text-white"
                      style={{ background: "var(--primaryColor)" }}
                    >
                      {needingAttention}
                    </span>
                  )}
                  {entry.disabled && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                <Link
                  key={entry.label}
                  href={entry.href}
                  onClick={() => setMobileNavOpen(false)}
                >
                  {content}
                </Link>
              );
            })}
        </div>
      ))}
    </div>
  );

  const userMenu = (compact: boolean) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center transition-colors hover:bg-muted",
            compact
              ? "size-9 shrink-0 justify-center rounded-xl"
              : "w-full gap-3 px-3 py-3"
          )}
          aria-label="Menú de cuenta"
        >
          <div
            className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold text-white"
            style={{
              background: isLoading
                ? "var(--muted)"
                : `linear-gradient(135deg, var(--primaryColor), var(--primaryDark))`,
            }}
          >
            {(user?.name ?? "U").charAt(0).toUpperCase()}
          </div>
          {!compact && (
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
                {user?.name ?? "Usuario"}
              </p>
              <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                {user?.email ?? ""}
              </p>
            </div>
          )}
          {!compact && (
            <ChevronDown
              size={16}
              strokeWidth={1.7}
              className="shrink-0 text-muted-foreground"
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 shadow-md">
        <DropdownMenuLabel>
          <p className="font-semibold">{user?.name ?? "Usuario"}</p>
          <p className="text-xs font-normal text-muted-foreground">
            {user?.email ?? ""}
          </p>
        </DropdownMenuLabel>
        {isOwner && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href={tenantId ? `${baseHref}/ajustes` : baseHref}
                className="cursor-pointer"
                onClick={() => setMobileNavOpen(false)}
              >
                <Settings size={16} strokeWidth={1.5} className="mr-2" />
                Ajustes
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
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
  );

  const sidebarInner = (opts: {
    iconOnly: boolean;
    showClose?: boolean;
    showCollapseToggle?: boolean;
  }) => (
    <>
      <div
        className={cn(
          "px-3 py-3",
          opts.iconOnly && !opts.showClose && "flex justify-center",
          opts.showClose && "flex items-center gap-2"
        )}
      >
        <div className={cn(opts.showClose && "min-w-0 flex-1")}>
          {brandBlock(opts.iconOnly)}
        </div>
        {opts.showClose && (
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Cerrar menú"
          >
            <X size={18} strokeWidth={1.7} />
          </button>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
        {isLoading ? (
          <div className="flex flex-col gap-2 px-2 pt-2">
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-6 w-3/4 rounded-lg" />
          </div>
        ) : opts.iconOnly ? (
          iconNav
        ) : (
          labelNav
        )}
      </nav>

      <div className="shrink-0 border-t border-border">
        <div
          className={cn(
            "px-1 pt-2",
            opts.iconOnly && "flex justify-center px-0"
          )}
        >
          <ThemeToggle collapsed={opts.iconOnly} />
        </div>
        <div
          className={cn(
            opts.iconOnly ? "flex justify-center py-1.5" : undefined
          )}
        >
          {userMenu(opts.iconOnly)}
        </div>
        {opts.showCollapseToggle && (
          <button
            type="button"
            onClick={() => setCollapsed((x) => !x)}
            className="flex w-full items-center justify-center gap-2 border-t border-border py-2 text-muted-foreground transition-colors hover:bg-muted"
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? (
              <SidebarTooltip label="Expandir menú" side="right">
                <span className="inline-flex size-8 items-center justify-center">
                  <ChevronLeft
                    size={16}
                    strokeWidth={1.7}
                    className="rotate-180 transition-transform duration-200"
                  />
                </span>
              </SidebarTooltip>
            ) : (
              <>
                <ChevronLeft
                  size={16}
                  strokeWidth={1.7}
                  className="transition-transform duration-200"
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider">
                  Colapsar
                </span>
              </>
            )}
          </button>
        )}
      </div>
    </>
  );

  return (
    <div
      className="flex h-screen overflow-hidden bg-muted/40 text-foreground"
      style={cssVars}
    >
      {/* Overlay móvil */}
      <div
        role="presentation"
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden",
          mobileNavOpen
            ? "opacity-100"
            : "pointer-events-none opacity-0"
        )}
        onClick={() => setMobileNavOpen(false)}
      />

      {/* Drawer móvil */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(280px,88vw)] flex-col overflow-hidden border-r border-border bg-card shadow-md transition-transform duration-200 ease-out lg:hidden",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-hidden={!mobileNavOpen}
      >
        {sidebarInner({ iconOnly: false, showClose: true })}
      </aside>

      {/* Sidebar desktop */}
      <aside
        className={cn(
          "m-3 hidden shrink-0 flex-col overflow-hidden rounded-2xl transition-all duration-200 ease-out lg:flex",
          collapsed ? "w-[72px]" : "w-[240px]"
        )}
      >
        {sidebarInner({
          iconOnly: collapsed,
          showCollapseToggle: true,
        })}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden lg:my-3 lg:mr-3">
        {/* Barra móvil: menú · marca · cuenta */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Abrir menú"
          >
            <Menu size={20} strokeWidth={1.7} />
          </button>
          <Link
            href="/tenants"
            className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden"
          >
            <span
              className="grid size-8 shrink-0 place-items-center rounded-lg"
              style={{ backgroundColor: primaryColor }}
              aria-hidden
            >
              <Flame size={15} strokeWidth={2} className="text-white" />
            </span>
            <span className="min-w-0 truncate text-sm font-medium tracking-tight text-foreground">
              {isLoading ? "…" : brandName}
            </span>
          </Link>
          {userMenu(true)}
        </header>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden bg-card",
            "border-0 shadow-none lg:rounded-2xl lg:border lg:border-border lg:shadow-sm"
          )}
        >
          {isLoading ? (
            <div className="flex flex-1 flex-col overflow-y-auto p-6 sm:p-8 md:p-10">
              <div className="mx-auto w-full space-y-8 p-4 md:p-6 lg:p-8">
                <div className="space-y-3">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-4 w-96" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-28 rounded-xl" />
                  ))}
                </div>
                <div className="grid gap-8 lg:grid-cols-3">
                  <div className="space-y-4 lg:col-span-2">
                    <Skeleton className="h-48 rounded-xl" />
                    <Skeleton className="h-36 rounded-xl" />
                  </div>
                  <div className="space-y-4">
                    <Skeleton className="h-32 rounded-xl" />
                    <Skeleton className="h-48 rounded-xl" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col",
                isInbox ? "overflow-hidden" : "overflow-y-auto"
              )}
            >
              {children}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
