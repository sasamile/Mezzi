"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import Link from "next/link";
import {
  MessageSquare,
  MessageCircle,
  TrendingUp,
  Bot,
  Mail,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  ShoppingBag,
  Headphones,
  BookOpen,
  WifiOff,
  Brain,
  CreditCard,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Area,
  AreaChart as ReAreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const DEFAULT_PRIMARY = "#197fe6";

const RANGES = [
  { value: 1, label: "Hoy" },
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
] as const;

function formatRelTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "Ahora";
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

// ── SVG micro-components ───────────────────────────────────────────────────────

/** Donut ring chart — HTML-based center text to avoid SVG font issues */
function RingChart({ pct, color, size = 92 }: { pct: number; color: string; size?: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const strokeW = 8;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="absolute inset-0"
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Track */}
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth={strokeW} />
        {/* Progress arc — only rendered when pct > 0 to avoid round-cap dot artifact */}
        {pct > 0 && (
          <circle
            cx="50" cy="50" r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
          />
        )}
      </svg>
      {/* Center text as HTML for crisp rendering */}
      <div className="relative flex flex-col items-center leading-none">
        <span
          className="text-[20px] font-bold tabular-nums"
          style={{ color: pct === 0 ? "#94a3b8" : color }}
        >
          {pct}%
        </span>
        <span className="mt-0.5 text-[9px] font-semibold tracking-widest text-slate-400">BOT</span>
      </div>
    </div>
  );
}

/** Area chart — Recharts via shadcn ChartContainer */
function DailyChart({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((value, i) => {
    const d = new Date(Date.now() - (data.length - 1 - i) * 86_400_000);
    const day = d.toLocaleDateString("es-CO", { weekday: "short" }).replace(".", "");
    return { day: day.charAt(0).toUpperCase() + day.slice(1), value };
  });

  const chartConfig: ChartConfig = {
    value: { label: "Conversaciones", color },
  };

  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <ReAreaChart
        data={chartData}
        margin={{ top: 8, right: 8, bottom: 0, left: -24 }}
      >
        <defs>
          <linearGradient id="dailyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.18} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          dy={6}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          allowDecimals={false}
          width={28}
        />
        <ChartTooltip
          cursor={{ stroke: color, strokeWidth: 1, strokeOpacity: 0.2 }}
          content={
            <ChartTooltipContent
              className="rounded-xl border border-slate-200 bg-white shadow-md text-xs"
              labelFormatter={(v) => v}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill="url(#dailyFill)"
          dot={{ fill: color, r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
        />
      </ReAreaChart>
    </ChartContainer>
  );
}

/** 24-bar hourly distribution — HTML divs so bars are always visible */
function HourlyBars({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const peakIdx = data.indexOf(Math.max(...data));

  return (
    <div>
      <div className="flex h-10 items-end gap-[2px]">
        {data.map((v, i) => {
          const heightPct = v === 0 ? 8 : Math.max(12, Math.round((v / max) * 100));
          const isPeak = i === peakIdx;
          const opacity = isPeak ? 1 : v === 0 ? 0.15 : 0.2 + (v / max) * 0.65;
          return (
            <div
              key={i}
              className="flex-1 rounded-[2px] transition-all"
              style={{
                height: `${heightPct}%`,
                backgroundColor: color,
                opacity,
              }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between px-0">
        {([0, 6, 12, 18, 23] as const).map((h) => (
          <span key={h} className="text-[10px] text-slate-400">
            {h}h
          </span>
        ))}
      </div>
    </div>
  );
}

/** Mini sparkline for KPI card — pure SVG, no text, safe with preserveAspectRatio="none" */
function MiniSpark({ data, color }: { data: number[]; color: string }) {
  const gradId = React.useId().replace(/:/g, "");
  if (!data?.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const n = Math.max(data.length - 1, 1);
  const W = 100;
  const H = 28;

  const pts = data.map((v, i) => ({
    x: (i / n) * W,
    y: H - ((v - min) / range) * (H - 4) - 2,
  }));

  const polyLine = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPts = `0,${H} ${polyLine} ${W},${H}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full mt-3"
      style={{ height: 22 }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`ms-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#ms-${gradId})`} />
      <polyline
        points={polyLine}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const { user } = useAuth();
  const { tenantId, setTenantId } = useTenant();
  const [rangeDays, setRangeDays] = React.useState<1 | 7 | 30>(7);

  const memberships = useQuery(
    api.users.getTenantsForUser,
    user?._id ? { userId: user._id as Id<"users"> } : "skip"
  );
  const scopedTenant = useQuery(
    api.tenants.getByHost,
    typeof window !== "undefined" ? { host: window.location.hostname } : "skip"
  );

  const tenants =
    memberships
      ?.map((m) => m.tenant)
      .filter((t): t is NonNullable<typeof t> => t != null) ?? [];

  React.useEffect(() => {
    if (scopedTenant) {
      setTenantId(scopedTenant._id);
      return;
    }
    if (memberships?.length === 1 && memberships[0]?.tenant) {
      setTenantId(memberships[0].tenant._id);
    }
  }, [memberships, scopedTenant, setTenantId]);

  const tenant = useQuery(api.tenants.get, tenantId ? { tenantId } : "skip");
  const ycloud = useQuery(api.integrations.getYCloud, tenantId ? { tenantId } : "skip");
  const stats = useQuery(api.dashboard.getStats, tenantId ? { tenantId, rangeDays } : "skip");

  const primaryColor = tenant?.primaryColor ?? DEFAULT_PRIMARY;
  const ycloudConnected = ycloud?.connected ?? false;

  const modules = tenant?.enabledModules ?? {};
  const activeModules = [
    modules.reservas !== false && {
      href: "/tenants/reservas",
      Icon: Calendar,
      label: "Reservas",
      desc: "Ver calendario",
    },
    modules.pedidos !== false && {
      href: "/tenants/solicitudes",
      Icon: ShoppingBag,
      label: "Pedidos",
      desc: "Gestionar solicitudes",
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

  const activities = React.useMemo(
    () =>
      (stats?.recentConversations ?? [])
        .map((c) => ({
          name: c.customerName,
          status: c.status === "open" ? "Abierta" : "Cerrada",
          time: c.lastMessageAt,
          escalated: !!c.assignedTo,
        }))
        .sort((a, b) => b.time - a.time)
        .slice(0, 6),
    [stats?.recentConversations]
  );

  // hourlyDistribution is a new field — handle absence gracefully
  const hourlyData = stats?.hourlyDistribution as number[] | undefined;

  const cssVars = {
    "--primaryColor": primaryColor,
    "--primaryDark": `color-mix(in srgb, ${primaryColor} 78%, #1a1a2e)`,
    "--primarySoft": `color-mix(in srgb, ${primaryColor} 14%, white)`,
  } as React.CSSProperties;

  // ── Loading / access guards ────────────────────────────────────────────────
  if (memberships === undefined || (memberships?.length === 1 && !tenantId)) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center"
        style={{ fontFamily: "var(--font-jakarta)" }}
      >
        <p className="text-sm text-slate-400">Cargando…</p>
      </div>
    );
  }

  if (tenants.length === 0) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center"
        style={{ fontFamily: "var(--font-jakarta)" }}
      >
        <p className="text-sm text-slate-400">Sin acceso a restaurantes.</p>
      </div>
    );
  }

  if (
    scopedTenant &&
    !memberships?.some((m) => m.tenantId === scopedTenant._id)
  ) {
    return (
      <div
        className="flex min-h-[50vh] items-center justify-center"
        style={{ fontFamily: "var(--font-jakarta)" }}
      >
        <p className="text-sm text-slate-400">
          Tu usuario no tiene acceso al restaurante de este dominio.
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-full overflow-y-auto"
      style={{ ...cssVars, background: "#f8fafc", fontFamily: "var(--font-jakarta)" }}
    >
      <div className="mx-auto max-w-[1180px] px-6 py-7 sm:px-8">

        {/* ── Header ── */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              {greeting}, {firstName}
            </h1>
            <p className="mt-0.5 text-sm text-slate-400">
              {new Date().toLocaleDateString("es-CO", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Time range pill selector */}
            <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRangeDays(r.value)}
                  className={cn(
                    "rounded-[9px] px-3.5 py-1.5 text-[13px] font-medium transition-all",
                    rangeDays === r.value
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Link
              href="/tenants/inbox"
              className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: primaryColor }}
            >
              <Mail className="size-4" strokeWidth={2} />
              Inbox
            </Link>
          </div>
        </header>

        {/* ── WhatsApp alert banner ── */}
        {!ycloudConnected && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200/70 bg-amber-50 px-4 py-3">
            <WifiOff className="size-4 shrink-0 text-amber-500" />
            <p className="text-sm text-amber-700">
              WhatsApp no conectado —{" "}
              <Link
                href="/tenants/integraciones"
                className="font-semibold underline underline-offset-2"
              >
                configurar ahora
              </Link>
            </p>
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          {/* Total conversations */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Total
              </p>
              <div
                className="flex size-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
              >
                <MessageSquare className="size-4" strokeWidth={1.8} />
              </div>
            </div>
            <p className="mt-2 text-[32px] font-bold tabular-nums leading-none text-slate-900">
              {stats?.totalConversations ?? "—"}
            </p>
            {stats?.changePct != null && stats.changePct !== 0 && (
              <span
                className={cn(
                  "mt-2 inline-flex items-center gap-0.5 text-[12px] font-medium",
                  stats.changePct > 0 ? "text-emerald-600" : "text-rose-500"
                )}
              >
                {stats.changePct > 0 ? (
                  <ArrowUpRight className="size-3.5" />
                ) : (
                  <ArrowDownRight className="size-3.5" />
                )}
                {Math.abs(stats.changePct)}% vs período anterior
              </span>
            )}
            {stats?.sparkline && (
              <MiniSpark data={stats.sparkline} color={primaryColor} />
            )}
          </div>

          {/* Active conversations */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Activas
              </p>
              <div
                className="flex size-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
              >
                <MessageCircle className="size-4" strokeWidth={1.8} />
              </div>
            </div>
            <p className="mt-2 text-[32px] font-bold tabular-nums leading-none text-slate-900">
              {stats?.openConversations ?? "—"}
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-slate-400">
              <span className="inline-block size-1.5 rounded-full bg-emerald-400" />
              En curso ahora
            </span>
          </div>

          {/* Closed */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Cerradas
              </p>
              <div
                className="flex size-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
              >
                <TrendingUp className="size-4" strokeWidth={1.8} />
              </div>
            </div>
            <p className="mt-2 text-[32px] font-bold tabular-nums leading-none text-slate-900">
              {stats?.closedConversations ?? "—"}
            </p>
            <span className="mt-2 text-[12px] text-slate-400">
              {stats?.conversationsInRange ?? 0}{" "}
              en{" "}
              {rangeDays === 1 ? "hoy" : `últimos ${rangeDays}d`}
            </span>
          </div>

          {/* AI resolution rate */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-start justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Resolución IA
              </p>
              <div
                className="flex size-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
              >
                <Bot className="size-4" strokeWidth={1.8} />
              </div>
            </div>
            <p
              className="mt-2 text-[32px] font-bold tabular-nums leading-none"
              style={{ color: primaryColor }}
            >
              {botResolvedPct}%
            </p>
            <span className="mt-2 text-[12px] text-slate-400">
              {stats?.humanConversations ?? 0} escaladas a humano
            </span>
          </div>
        </div>

        {/* ── Main 2/3 + 1/3 grid ── */}
        <div className="grid gap-5 lg:grid-cols-3 lg:items-start">

          {/* ── Left: charts — flex col so area chart stretches to fill right-column height ── */}
          <div className="flex flex-col gap-5 lg:col-span-2">

            {/* Daily area chart — grows to fill available vertical space */}
            <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 shrink-0">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Conversaciones por día
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Pico a las{" "}
                    {stats?.peakHour != null
                      ? String(stats.peakHour).padStart(2, "0")
                      : "—"}
                    :00
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-500">
                  {stats?.conversationsInRange ?? 0} en rango
                </span>
              </div>
              <div className="px-5 pb-4 pt-4">
                <div className="h-52">
                  {stats?.sparkline?.length ? (
                    <DailyChart data={stats.sparkline} color={primaryColor} />
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-xl bg-slate-50/80 text-sm text-slate-400">
                      Sin datos en este período
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Hourly distribution */}
            <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Actividad por hora
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Distribución de conversaciones · 24 horas
                  </p>
                </div>
                {stats?.peakHour != null && (
                  <span className="text-xs text-slate-400">
                    Pico:{" "}
                    <span className="font-semibold text-slate-700">
                      {String(stats.peakHour).padStart(2, "0")}:00
                    </span>
                  </span>
                )}
              </div>
              <div className="mt-3">
                {hourlyData?.length === 24 ? (
                  <HourlyBars data={hourlyData} color={primaryColor} />
                ) : (
                  <div className="flex h-10 items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400">
                    {stats ? "Sin datos suficientes" : "Cargando…"}
                  </div>
                )}
              </div>
            </div>
            {/* ── Active modules ── */}
            {activeModules.length > 0 && (
              <div className="mt-6">
                <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Módulos activos
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {activeModules.map(({ href, Icon, label, desc }) => (
                    <Link
                      key={href}
                      href={href}
                      className="group flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:border-slate-300 hover:shadow-md"
                    >
                      <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white transition group-hover:opacity-90"
                        style={{ backgroundColor: primaryColor }}
                      >
                        <Icon className="size-5" strokeWidth={1.8} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{label}</p>
                        <p className="text-xs text-slate-400">{desc}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* ── Right: stats sidebar ── */}
          <div className="space-y-5">

            {/* Bot / IA ring chart */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Rendimiento IA
                </h2>
              </div>
              <div className="flex items-center gap-6 px-5 py-5">
                <RingChart pct={botResolvedPct} color={primaryColor} size={88} />
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                      Por IA
                    </p>
                    <p
                      className="mt-0.5 text-2xl font-bold tabular-nums"
                      style={{ color: primaryColor }}
                    >
                      {stats?.closedByBot ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                      Escaladas
                    </p>
                    <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-700">
                      {stats?.humanConversations ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Integrations */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Integraciones
                </h2>
              </div>
              <div className="px-3 py-2">
                {(
                  [
                    {
                      id: "wa",
                      label: "WhatsApp",
                      connected: ycloudConnected,
                      Icon: MessageCircle,
                    },
                    { id: "ai", label: "IA Asistente", connected: true, Icon: Brain },
                    { id: "pay", label: "Pagos", connected: false, Icon: CreditCard },
                  ] as const
                ).map(({ id, label, connected, Icon }) => (
                  <div
                    key={id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  >
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-lg",
                        connected ? "bg-emerald-50" : "bg-slate-100"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4",
                          connected ? "text-emerald-600" : "text-slate-400"
                        )}
                        strokeWidth={1.8}
                      />
                    </div>
                    <span className="flex-1 text-[13px] font-medium text-slate-700">
                      {label}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        connected
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-slate-100 text-slate-400"
                      )}
                    >
                      {connected ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Actividad reciente
                </h2>
                <Link
                  href="/tenants/inbox"
                  className="text-[12px] font-medium"
                  style={{ color: primaryColor }}
                >
                  Ver todo
                </Link>
              </div>
              <div className="px-3 py-2">
                {activities.length === 0 ? (
                  <p className="py-7 text-center text-xs text-slate-400">
                    Sin actividad reciente
                  </p>
                ) : (
                  <ul>
                    {activities.map((a, i) => (
                      <li key={i}>
                        <Link
                          href="/tenants/inbox"
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50"
                        >
                          <div
                            className="flex size-7 shrink-0 items-center justify-center rounded-lg"
                            style={{
                              backgroundColor: a.escalated
                                ? "#fef2f2"
                                : `${primaryColor}12`,
                              color: a.escalated ? "#dc2626" : primaryColor,
                            }}
                          >
                            {a.escalated ? (
                              <Users className="size-3.5" strokeWidth={1.8} />
                            ) : (
                              <MessageSquare className="size-3.5" strokeWidth={1.8} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-slate-800">
                              {a.name}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {a.status} · {formatRelTime(a.time)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

          </div>
        </div>



      </div>
    </div>
  );
}
