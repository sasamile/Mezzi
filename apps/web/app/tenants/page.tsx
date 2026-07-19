"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { useHostScopedTenant } from "@/lib/use-host-scoped-tenant";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  MessageSquare,
  MessageCircle,
  TrendingUp,
  Bot,
  Mail,
  Calendar,
  ShoppingBag,
  Headphones,
  BookOpen,
  WifiOff,
  Brain,
  CreditCard,
  ArrowRight,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import {
  ConversationsAreaChart,
  HourlyActivityChart,
  AiResolutionRing,
} from "@/components/dashboard/charts";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { Skeleton } from "@/components/ui/skeleton";

const RANGE_OPTIONS = [
  { value: 1 as const, label: "Hoy" },
  { value: 7 as const, label: "7 días" },
  { value: 30 as const, label: "30 días" },
];

function formatRelTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "Ahora";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export default function TenantsPage() {
  const { user } = useAuth();
  const { tenantId, setTenantId } = useTenant();
  const [rangeDays, setRangeDays] = React.useState<1 | 7 | 30>(7);

  const memberships = useQuery(
    api.users.getTenantsForUser,
    user?._id ? { userId: user._id as Id<"users"> } : "skip"
  );
  const scopedTenant = useHostScopedTenant();

  const tenants =
    memberships
      ?.map((m) => m.tenant)
      .filter((t): t is NonNullable<typeof t> => t != null) ?? [];

  React.useEffect(() => {
    if (scopedTenant) return;
    if (memberships?.length === 1 && memberships[0]?.tenant) {
      setTenantId(memberships[0].tenant._id);
    }
  }, [memberships, scopedTenant, setTenantId]);

  const tenant = useQuery(api.tenants.get, tenantId ? { tenantId } : "skip");
  const ycloud = useQuery(
    api.integrations.getYCloud,
    tenantId ? { tenantId } : "skip"
  );
  const stats = useQuery(
    api.dashboard.getStats,
    tenantId ? { tenantId, rangeDays } : "skip"
  );

  const ycloudConnected = ycloud?.connected ?? false;

  const modules = tenant?.enabledModules ?? {};
  const activeModules = [
    modules.reservas !== false && {
      href: "/tenants/reservas",
      Icon: Calendar,
      label: "Reservas",
      desc: "Calendario",
    },
    modules.pedidos !== false && {
      href: "/tenants/solicitudes",
      Icon: ShoppingBag,
      label: "Pedidos",
      desc: "Solicitudes",
    },
    modules.pqr !== false && {
      href: "/tenants/pqrs",
      Icon: Headphones,
      label: "PQRs",
      desc: "Quejas y reclamos",
    },
    modules.conocimiento !== false && {
      href: "/tenants/knowledge",
      Icon: BookOpen,
      label: "Conocimiento",
      desc: "Base de datos",
    },
  ].filter(Boolean) as {
    href: string;
    Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    label: string;
    desc: string;
  }[];

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";
  const firstName = user?.name?.split(/\s+/)[0] ?? "Usuario";

  const botResolvedPct =
    stats && stats.closedConversations > 0
      ? Math.round((stats.closedByBot / stats.closedConversations) * 100)
      : 0;

  const activityItems = React.useMemo(
    () =>
      (stats?.recentConversations ?? [])
        .map((c) => ({
          name: c.customerName,
          status: c.status === "open" ? "Abierta" : "Cerrada",
          time: formatRelTime(c.lastMessageAt),
          escalated: !!c.assignedTo,
          sort: c.lastMessageAt,
        }))
        .sort((a, b) => b.sort - a.sort)
        .slice(0, 6)
        .map(({ sort: _s, ...rest }) => rest),
    [stats?.recentConversations]
  );

  const hourlyData = stats?.hourlyDistribution as number[] | undefined;
  const statsLoading = tenantId != null && stats === undefined;

  if (memberships === undefined || (memberships?.length === 1 && !tenantId)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Sin acceso a restaurantes.</p>
      </div>
    );
  }

  if (
    scopedTenant &&
    !memberships?.some((m) => m.tenantId === scopedTenant._id)
  ) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Tu usuario no tiene acceso al restaurante de este dominio.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full bg-background">
      <div className="flex w-full flex-col gap-6 p-4 md:p-6 lg:p-8">
        {/* Header — mismo ritmo que el sidebar: limpio, un CTA */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {greeting}, {firstName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date().toLocaleDateString("es-CO", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              {tenant?.name ? ` · ${tenant.name}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRangeDays(r.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                    rangeDays === r.value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Link
              href="/tenants/inbox"
              className="inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--primaryColor)" }}
            >
              <Mail className="size-4" strokeWidth={2} />
              Inbox
            </Link>
          </div>
        </header>

        {!ycloudConnected && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
            <WifiOff className="size-4 shrink-0 text-muted-foreground" />
            <p className="flex-1 text-sm text-muted-foreground">
              WhatsApp no conectado.{" "}
              <Link
                href="/tenants/integraciones"
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                Configurar integración
              </Link>
            </p>
          </div>
        )}

        {/* KPI row */}
        {statsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[120px] rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Total conversaciones"
              value={stats?.totalConversations ?? "—"}
              changePct={stats?.changePct}
              icon={MessageSquare}
              description="En el período seleccionado"
            />
            <StatCard
              title="Activas ahora"
              value={stats?.openConversations ?? "—"}
              icon={MessageCircle}
              description="Conversaciones abiertas"
            />
            <StatCard
              title="Cerradas"
              value={stats?.closedConversations ?? "—"}
              icon={TrendingUp}
              description={`${stats?.conversationsInRange ?? 0} en rango`}
            />
            <StatCard
              title="Resolución IA"
              value={`${botResolvedPct}%`}
              icon={Bot}
              description={`${stats?.humanConversations ?? 0} escaladas a humano`}
            />
          </div>
        )}

        {/* Main chart + side column */}
        <div className="grid items-stretch gap-4 lg:grid-cols-7">
          <DashboardPanel
            className="lg:col-span-4"
            title="Conversaciones"
            description={
              stats?.peakHour != null
                ? `Total del período · pico a las ${String(stats.peakHour).padStart(2, "0")}:00`
                : "Total del período seleccionado"
            }
            action={
              <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                {stats?.conversationsInRange ?? 0}
              </span>
            }
            bodyClassName="pt-2"
          >
            {statsLoading ? (
              <Skeleton className="h-[260px] w-full rounded-lg" />
            ) : stats?.sparkline?.length ? (
              <ConversationsAreaChart data={stats.sparkline} />
            ) : (
              <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <MessageSquare className="size-5 opacity-40" strokeWidth={1.5} />
                Sin datos en este período
              </div>
            )}
          </DashboardPanel>

          <DashboardPanel
            className="lg:col-span-3"
            title="Rendimiento IA"
            description="Bot vs atención humana"
            bodyClassName="items-center justify-center gap-6 sm:flex-row"
          >
            <AiResolutionRing pct={botResolvedPct} size={128} />
            <div className="w-full space-y-4 sm:w-auto sm:min-w-[140px]">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Resueltas por IA
                </p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {stats?.closedByBot ?? 0}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Escaladas
                </p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums text-(--primaryColor)">
                  {stats?.humanConversations ?? 0}
                </p>
              </div>
            </div>
          </DashboardPanel>
        </div>

        {/* Hourly + activity — misma altura */}
        <div className="grid items-stretch gap-4 lg:grid-cols-7 lg:min-h-[320px]">
          <DashboardPanel
            className="lg:col-span-4"
            title="Actividad por hora"
            description="Distribución en 24 horas"
            action={
              stats?.peakHour != null ? (
                <span className="text-xs text-muted-foreground">
                  Pico{" "}
                  <span className="font-semibold text-foreground">
                    {String(stats.peakHour).padStart(2, "0")}:00
                  </span>
                </span>
              ) : undefined
            }
            bodyClassName="min-h-0"
          >
            {hourlyData?.length === 24 ? (
              <div className="min-h-0 flex-1">
                <HourlyActivityChart data={hourlyData} className="h-full min-h-[200px]" />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                {stats ? "Sin datos suficientes" : "Cargando…"}
              </div>
            )}
          </DashboardPanel>

          <DashboardPanel
            className="lg:col-span-3"
            title="Actividad reciente"
            description="Últimas conversaciones"
            action={
              <Link
                href="/tenants/inbox"
                className="inline-flex items-center gap-1 text-xs font-medium text-(--primaryColor) hover:underline"
              >
                Ver todo
                <ArrowRight className="size-3" />
              </Link>
            }
            bodyClassName="min-h-0 overflow-y-auto px-3 py-3"
          >
            <ActivityFeed items={activityItems} />
          </DashboardPanel>
        </div>

        {/* Integrations + modules — misma altura */}
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <DashboardPanel title="Integraciones" description="Estado de conexiones">
            <div className="flex flex-1 flex-col justify-center space-y-1">
              {(
                [
                  {
                    id: "wa",
                    label: "WhatsApp",
                    connected: ycloudConnected,
                    Icon: MessageCircle,
                  },
                  {
                    id: "ai",
                    label: "IA Asistente",
                    connected: true,
                    Icon: Brain,
                  },
                  {
                    id: "pay",
                    label: "Pagos",
                    connected: false,
                    Icon: CreditCard,
                  },
                ] as const
              ).map(({ id, label, connected, Icon }) => (
                <div
                  key={id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5"
                >
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-lg",
                      connected
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="size-4" strokeWidth={1.8} />
                  </div>
                  <span className="flex-1 text-sm font-medium text-foreground">
                    {label}
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                      connected
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {connected ? "Activo" : "Inactivo"}
                  </span>
                </div>
              ))}
            </div>
          </DashboardPanel>

          {activeModules.length > 0 ? (
            <DashboardPanel
              title="Módulos activos"
              description="Accesos rápidos"
              bodyClassName="justify-center"
            >
              <div
                className={cn(
                  "grid w-full gap-2",
                  activeModules.length === 1
                    ? "grid-cols-1"
                    : "sm:grid-cols-2"
                )}
              >
                {activeModules.map(({ href, Icon, label, desc }) => (
                  <Link
                    key={href}
                    href={href}
                    className="group flex items-center gap-3 rounded-lg border border-border px-3 py-3 transition-colors duration-150 hover:bg-muted/50"
                  >
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: "var(--primaryColor)" }}
                    >
                      <Icon className="size-4" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {label}
                      </p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </DashboardPanel>
          ) : (
            <DashboardPanel
              title="Módulos activos"
              description="Accesos rápidos"
              bodyClassName="justify-center"
            >
              <p className="text-sm text-muted-foreground">
                No hay módulos habilitados.
              </p>
            </DashboardPanel>
          )}
        </div>
      </div>
    </div>
  );
}
