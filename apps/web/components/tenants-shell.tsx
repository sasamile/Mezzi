"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { useQuery } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
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
  GalleryVerticalEnd,
  Settings,
  LogOut,
  ChevronsUpDown,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";

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
  module?:
    | "pqr"
    | "pedidos"
    | "reservas"
    | "conocimiento"
    | "trabajaConNosotros"
    | "pdfs";
}

const PAGE_TITLES: Record<string, string> = {
  "/tenants": "Dashboard",
  "/tenants/inbox": "Inbox",
  "/tenants/knowledge": "Conocimiento",
  "/tenants/menu": "Documentos PDF",
  "/tenants/aprendizaje": "Aprendizaje",
  "/tenants/reservas": "Reservas",
  "/tenants/solicitudes": "Pedidos",
  "/tenants/pqrs": "PQRs",
  "/tenants/trabaja-con-nosotros": "Trabaja con Nosotros",
  "/tenants/clientes": "Clientes",
  "/tenants/integraciones": "Integraciones",
  "/tenants/users": "Usuarios",
  "/tenants/ajustes": "Ajustes",
};

function resolvePageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const match = Object.keys(PAGE_TITLES)
    .filter((k) => k !== "/tenants" && pathname.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_TITLES[match]! : "Panel";
}

function ThemeMenuItem() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && theme === "dark";

  return (
    <DropdownMenuItem
      className="cursor-pointer"
      onSelect={(e) => {
        e.preventDefault();
        setTheme(isDark ? "light" : "dark");
      }}
    >
      {isDark ? (
        <Sun className="mr-2 size-4" strokeWidth={1.5} />
      ) : (
        <Moon className="mr-2 size-4" strokeWidth={1.5} />
      )}
      {isDark ? "Modo claro" : "Modo oscuro"}
    </DropdownMenuItem>
  );
}

function formatDisplayName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  if (/^(al|ai)[\s_-]*carb[oó]n$/i.test(trimmed)) {
    return "Al Carbón";
  }
  const letters = trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (letters.length > 1 && letters === letters.toUpperCase()) {
    return trimmed
      .toLowerCase()
      .replace(/(^|[\s\-_/])(\S)/g, (_m, sep: string, c: string) => sep + c.toUpperCase());
  }
  return trimmed;
}

function TenantBrandHeader({
  brandName,
  brandSubtitle,
  primaryColor,
  isLoading,
}: {
  brandName: string;
  brandSubtitle: string;
  primaryColor: string;
  isLoading: boolean;
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          asChild
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Link href="/tenants">
            <div
              className="flex aspect-square size-8 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <GalleryVerticalEnd className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight normal-case">
              <span className="truncate font-semibold">
                {isLoading ? "…" : brandName}
              </span>
              <span className="truncate text-xs">{brandSubtitle}</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function NavUserFooter({
  name,
  email,
  isOwner,
  baseHref,
  tenantId,
  onLogout,
}: {
  name: string;
  email: string;
  isOwner: boolean;
  baseHref: string;
  tenantId: Id<"tenants"> | null;
  onLogout: () => void;
}) {
  const { isMobile } = useSidebar();
  const initial = (name || "U").charAt(0).toUpperCase();
  const avatarSrc = `https://i.pravatar.cc/128?u=${encodeURIComponent(email || name || "user")}`;

  const avatar = (
    <Avatar className="size-8 rounded-lg">
      <AvatarImage src={avatarSrc} alt={name} />
      <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
    </Avatar>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {avatar}
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
                <span className="truncate text-xs">{email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                {avatar}
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ThemeMenuItem />
            {isOwner && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    href={tenantId ? `${baseHref}/ajustes` : baseHref}
                    className="cursor-pointer"
                  >
                    <Settings className="mr-2 size-4" strokeWidth={1.5} />
                    Ajustes
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onSelect={onLogout}
            >
              <LogOut className="mr-2 size-4" strokeWidth={1.5} />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function TenantsShell({ children }: TenantsShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { tenantId } = useTenant();

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
  const pageTitle = resolvePageTitle(pathname);

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
  const brandName = formatDisplayName(
    displayTenant?.name?.trim() || "Tenant"
  );
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
    key:
      | "pqr"
      | "pedidos"
      | "reservas"
      | "conocimiento"
      | "trabajaConNosotros"
      | "pdfs"
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
        group: "Operación",
        module: "reservas" as const,
      },
      {
        href: `${baseHref}/solicitudes`,
        pageKey: "pedidos",
        Icon: Truck,
        label: "Pedidos",
        group: "Operación",
        module: "pedidos" as const,
      },
      {
        href: `${baseHref}/pqrs`,
        pageKey: "pqrs",
        Icon: Headphones,
        label: "PQRs",
        group: "Operación",
        module: "pqr" as const,
      },
      {
        href: `${baseHref}/trabaja-con-nosotros`,
        pageKey: "trabajaConNosotros",
        Icon: Briefcase,
        label: "Trabaja con Nosotros",
        group: "Operación",
        module: "trabajaConNosotros" as const,
      },
      {
        href: `${baseHref}/clientes`,
        pageKey: "clientes",
        Icon: UserIcon,
        label: "Clientes",
        group: "Operación",
      },
      {
        href: `${baseHref}/integraciones`,
        pageKey: "integraciones",
        Icon: Link2,
        label: "Integraciones",
        group: "Administración",
      },
      {
        href: `${baseHref}/users`,
        pageKey: "users",
        Icon: Users,
        label: "Usuarios",
        group: "Administración",
      },
    ] as NavEntry[]
  ).filter((e) => {
    if (!tenantId && e.group !== "General") return false;
    if (e.module && !hasModule(e.module)) return false;
    if (!hasPageAccess(e.pageKey)) return false;
    if (
      (e.pageKey === "users" || e.pageKey === "integraciones") &&
      !isOwner
    ) {
      return false;
    }
    return true;
  });

  const groups = [...new Set(navEntries.map((e) => e.group))];

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  return (
    <SidebarProvider
      style={
        {
          ...cssVars,
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3.25rem",
        } as CSSProperties
      }
      className="h-dvh max-h-dvh overflow-hidden overscroll-none"
    >
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <TenantBrandHeader
            brandName={brandName}
            brandSubtitle={brandSubtitle}
            primaryColor={primaryColor}
            isLoading={isLoading}
          />
        </SidebarHeader>

        <SidebarContent className="scrollbar-none">
          {isLoading ? (
            <SidebarGroup>
              <SidebarGroupContent>
                <div className="flex flex-col gap-2 px-2 py-1">
                  <Skeleton className="h-8 w-full rounded-md" />
                  <Skeleton className="h-8 w-full rounded-md" />
                  <Skeleton className="h-8 w-3/4 rounded-md" />
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            groups.map((group) => (
              <SidebarGroup key={group}>
                <SidebarGroupLabel>{group}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navEntries
                      .filter((e) => e.group === group)
                      .map((entry) => {
                        const active =
                          !entry.disabled && isActive(entry.href);
                        const showBadge =
                          !entry.disabled &&
                          entry.href.includes("/inbox") &&
                          (needingAttention ?? 0) > 0;

                        if (entry.disabled) {
                          return (
                            <SidebarMenuItem key={entry.label}>
                              <SidebarMenuButton
                                disabled
                                tooltip={
                                  entry.disabledTitle ?? entry.label
                                }
                                className="opacity-50"
                              >
                                <entry.Icon />
                                <span>{entry.label}</span>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          );
                        }

                        return (
                          <SidebarMenuItem key={entry.label}>
                            <SidebarMenuButton
                              asChild
                              isActive={active}
                              tooltip={entry.label}
                            >
                              <Link href={entry.href}>
                                <entry.Icon
                                  className={
                                    active
                                      ? "text-(--primaryColor)"
                                      : undefined
                                  }
                                  style={
                                    active
                                      ? { color: "var(--primaryColor)" }
                                      : undefined
                                  }
                                />
                                <span>{entry.label}</span>
                              </Link>
                            </SidebarMenuButton>
                            {showBadge && (
                              <SidebarMenuBadge>
                                {needingAttention}
                              </SidebarMenuBadge>
                            )}
                          </SidebarMenuItem>
                        );
                      })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))
          )}
        </SidebarContent>

        <SidebarFooter>
          <NavUserFooter
            name={user?.name ?? "Usuario"}
            email={user?.email ?? ""}
            isOwner={isOwner}
            baseHref={baseHref}
            tenantId={tenantId}
            onLogout={() => {
              logout();
              router.push("/login");
            }}
          />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-1.5 text-sm normal-case"
          >
            <span className="hidden truncate text-muted-foreground sm:inline">
              {isLoading ? "…" : brandName}
            </span>
            <span className="hidden text-muted-foreground sm:inline">/</span>
            <span className="truncate font-medium text-foreground">
              {pageTitle}
            </span>
          </nav>
        </header>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overscroll-contain bg-background",
            isInbox
              ? "overflow-hidden"
              : "overflow-y-auto [-webkit-overflow-scrolling:touch]"
          )}
        >
          {isLoading ? (
            <div className="flex flex-1 flex-col overflow-y-auto p-6 sm:p-8">
              <div className="mx-auto w-full max-w-6xl space-y-8">
                <div className="space-y-3">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-4 w-96 max-w-full" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-28 rounded-xl" />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
