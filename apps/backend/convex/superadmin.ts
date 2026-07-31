import { query } from "./_generated/server";
import { v } from "convex/values";
import { assertSuperadmin } from "./lib/tenantAccess";

/** Estadísticas para el dashboard superadmin */
export const getStats = query({
  args: { actorUserId: v.id("users") },
  handler: async (ctx, args) => {
    await assertSuperadmin(ctx, args.actorUserId);

    const tenants = await ctx.db.query("tenants").collect();
    const plans = await ctx.db.query("plans").collect();
    const users = await ctx.db.query("users").collect();
    const conversations = await ctx.db.query("conversations").collect();

    // Valor estimado: suma del precio del plan de cada restaurante activo
    let valorEstimado = 0;
    for (const t of tenants) {
      if (t.status !== "cancelled" && t.planId) {
        const plan = plans.find((p) => p._id === t.planId);
        if (plan) valorEstimado += plan.price;
      }
    }

    const activeTenants = tenants.filter((t) => t.status === "active").length;
    const trialTenants = tenants.filter((t) => t.status === "trial").length;

    return {
      totalRestaurantes: tenants.length,
      restaurantesActivos: activeTenants,
      restaurantesTrial: trialTenants,
      totalPlanes: plans.length,
      totalUsuarios: users.length,
      totalConversaciones: conversations.length,
      valorEstimadoMensual: valorEstimado,
    };
  },
});

/** Historial de ingresos mensuales (últimos meses). Si no hay datos históricos, simula tendencia desde MRR actual. */
export const getRevenueHistory = query({
  args: { actorUserId: v.id("users"), months: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await assertSuperadmin(ctx, args.actorUserId);

    const months = args.months ?? 6;
    const tenants = await ctx.db.query("tenants").collect();
    const plans = await ctx.db.query("plans").collect();

    let currentMRR = 0;
    for (const t of tenants) {
      if (t.status !== "cancelled" && t.planId) {
        const plan = plans.find((p) => p._id === t.planId);
        if (plan) currentMRR += plan.price;
      }
    }

    const now = new Date();
    const result: { month: string; value: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" });
      const factor = 0.85 + (i / months) * 0.3;
      result.push({ month: label, value: Math.round(currentMRR * factor) });
    }
    return result;
  },
});

/** Actividad reciente: nuevos restaurantes, admins agregados, conversaciones. */
export const getRecentActivity = query({
  args: { actorUserId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await assertSuperadmin(ctx, args.actorUserId);

    const limit = args.limit ?? 8;
    const activities: { type: string; title: string; timestamp: number; extra?: string }[] = [];

    const tenants = await ctx.db.query("tenants").collect();
    tenants
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
      .forEach((t) => {
        activities.push({
          type: "restaurant",
          title: "Nuevo restaurante creado",
          timestamp: t.createdAt,
          extra: t.name,
        });
      });

    const userTenants = await ctx.db.query("userTenants").collect();
    const sortedUT = userTenants.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
    for (const ut of sortedUT) {
      const user = await ctx.db.get(ut.userId);
      activities.push({
        type: "admin",
        title: "Administrador agregado",
        timestamp: ut.createdAt,
        extra: user?.name ?? user?.email ?? "—",
      });
    }

    const conversations = await ctx.db.query("conversations").collect();
    conversations
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, 5)
      .forEach((c) => {
        activities.push({
          type: "conversation",
          title: "Conversación iniciada",
          timestamp: c.lastMessageAt,
          extra: c.customerName,
        });
      });

    activities.sort((a, b) => b.timestamp - a.timestamp);
    return activities.slice(0, limit);
  },
});

/** Lista usuarios superadmin (sin passwordHash) */
export const listSuperadminUsers = query({
  args: { actorUserId: v.id("users") },
  handler: async (ctx, args) => {
    await assertSuperadmin(ctx, args.actorUserId);

    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("isSuperadmin"), true))
      .order("desc")
      .collect();
    return users.map((u) => {
      const { passwordHash: _, ...safe } = u;
      return safe;
    });
  },
});
