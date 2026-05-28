import { query } from "./_generated/server";
import { v } from "convex/values";

const MS_DAY = 24 * 60 * 60 * 1000;

export const getStats = query({
  args: {
    tenantId: v.id("tenants"),
    rangeDays: v.optional(v.number()), // 1 = hoy, 7 = 7 días, 30 = 30 días
  },
  handler: async (ctx, args) => {
    const rangeDays = args.rangeDays ?? 7;
    const now = Date.now();
    const startMs = now - rangeDays * MS_DAY;

    const allConvs = await ctx.db
      .query("conversations")
      .withIndex("by_tenant_last_message", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    const convsInRange = allConvs.filter((c) => c.lastMessageAt >= startMs);
    const openConvs = allConvs.filter((c) => c.status === "open");
    const closedConvs = allConvs.filter((c) => c.status === "closed");
    const botConvs = allConvs.filter((c) => c.assignedTo == null);
    const humanConvs = allConvs.filter((c) => c.assignedTo != null);
    const closedByBot = closedConvs.filter((c) => c.assignedTo == null);

    // Conversaciones por día (para sparkline)
    const byDay: Record<number, number> = {};
    for (const c of convsInRange) {
      const day = Math.floor(c.lastMessageAt / MS_DAY) * MS_DAY;
      byDay[day] = (byDay[day] ?? 0) + 1;
    }
    const days = Array.from({ length: rangeDays }, (_, i) => {
      const d = now - (rangeDays - 1 - i) * MS_DAY;
      return Math.floor(d / MS_DAY) * MS_DAY;
    });
    const sparkline = days.map((d) => byDay[d] ?? 0);

    // Pico horario (simplificado: hora con más mensajes)
    const byHour: Record<number, number> = {};
    for (const c of convsInRange) {
      const h = new Date(c.lastMessageAt).getHours();
      byHour[h] = (byHour[h] ?? 0) + 1;
    }
    const peakHour =
      Object.entries(byHour).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 12;

    // 24-bucket hourly distribution (0–23)
    const hourlyDistribution = Array.from({ length: 24 }, (_, h) => byHour[h] ?? 0);

    // Variación vs periodo anterior (simulado)
    const prevStart = startMs - rangeDays * MS_DAY;
    const prevConvs = allConvs.filter((c) => c.lastMessageAt >= prevStart && c.lastMessageAt < startMs);
    const prevTotal = prevConvs.length;
    const currTotal = convsInRange.length;
    const changePct =
      prevTotal > 0
        ? Math.round(((currTotal - prevTotal) / prevTotal) * 100)
        : currTotal > 0 ? 100 : 0;

    return {
      totalConversations: allConvs.length,
      openConversations: openConvs.length,
      closedConversations: closedConvs.length,
      conversationsInRange: convsInRange.length,
      botConversations: botConvs.length,
      humanConversations: humanConvs.length,
      closedByBot: closedByBot.length,
      sparkline,
      hourlyDistribution,
      peakHour: Number(peakHour),
      changePct,
      recentConversations: convsInRange
        .slice(0, 10)
        .map((c) => ({
          _id: c._id,
          customerName: c.customerName,
          status: c.status,
          lastMessageAt: c.lastMessageAt,
          assignedTo: c.assignedTo,
        })),
    };
  },
});
