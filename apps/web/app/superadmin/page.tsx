"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import { Building2, BadgeDollarSign } from "lucide-react";
import { DashboardHeader } from "@/components/(admin)/dashboard/DashboardHeader";
import { DashboardMetricCards } from "@/components/(admin)/dashboard/DashboardMetricCards";
import { RevenueChart } from "@/components/(admin)/dashboard/RevenueChart";
import { QuickAccessCards } from "@/components/(admin)/dashboard/QuickAccessCards";
import { RecentActivity } from "@/components/(admin)/dashboard/RecentActivity";

export default function SuperadminDashboardPage() {
  const { user } = useAuth();
  const actorUserId = user?._id as Id<"users"> | undefined;

  const stats = useQuery(
    api.superadmin.getStats,
    actorUserId ? { actorUserId } : "skip"
  );
  const revenueHistory = useQuery(
    api.superadmin.getRevenueHistory,
    actorUserId ? { actorUserId, months: 6 } : "skip"
  );
  const activity = useQuery(
    api.superadmin.getRecentActivity,
    actorUserId ? { actorUserId, limit: 8 } : "skip"
  );

  const quickAccessCards = [
    {
      href: "/superadmin/restaurantes",
      title: "Restaurantes",
      desc: "Crear restaurantes, colores, plan, prompt. Administradores por restaurante.",
      count: stats === undefined ? "—" : stats.totalRestaurantes,
      icon: Building2,
      iconBg: "#EEF2FF",
      iconColor: "#6366F1",
    },
    {
      href: "/superadmin/planes",
      title: "Planes",
      desc: "Configurar planes disponibles para los restaurantes.",
      count: stats === undefined ? "—" : stats.totalPlanes,
      icon: BadgeDollarSign,
      iconBg: "#FEF2F2",
      iconColor: "#EF4444",
    },
  ];

  return (
    <div className="min-h-0 flex-1 bg-[#F8FAFC] rounded-3xl">
      <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-10">
          <DashboardHeader />

          <DashboardMetricCards stats={stats} />

          <section>
            <RevenueChart
              data={revenueHistory ?? []}
              mrr={stats?.valorEstimadoMensual ?? 0}
              activeRestaurants={stats?.restaurantesActivos ?? 0}
            />
          </section>

          <section>
            <QuickAccessCards cards={quickAccessCards} />
          </section>

          {activity && activity.length > 0 && (
            <section>
              <RecentActivity activities={activity} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
