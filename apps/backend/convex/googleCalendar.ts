import { mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { assertTenantOwner } from "./lib/tenantAccess";

export const get = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("googleCalendarIntegrations")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .first();
    if (!row) return null;
    return {
      connected: row.connected,
      calendarId: row.calendarId,
      hasTokens: !!(row.accessToken || row.refreshToken),
    };
  },
});

/** Solo para uso interno (actions) - contiene tokens. NO exponer al cliente. */
export const getForSync = internalQuery({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("googleCalendarIntegrations")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .first();
    return row;
  },
});

export const saveTokens = mutation({
  args: {
    tenantId: v.id("tenants"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    calendarId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("googleCalendarIntegrations")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .first();

    const payload = {
      accessToken: args.accessToken,
      refreshToken: args.refreshToken ?? existing?.refreshToken,
      expiresAt: args.expiresAt,
      calendarId: args.calendarId ?? existing?.calendarId ?? "primary",
      connected: true,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("googleCalendarIntegrations", {
      tenantId: args.tenantId,
      ...payload,
      createdAt: now,
    });
  },
});

export const disconnect = mutation({
  args: {
    actorUserId: v.id("users"),
    tenantId: v.id("tenants"),
  },
  handler: async (ctx, args) => {
    await assertTenantOwner(ctx, args.tenantId, args.actorUserId);
    const existing = await ctx.db
      .query("googleCalendarIntegrations")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .first();
    if (!existing) return null;
    await ctx.db.patch(existing._id, {
      accessToken: undefined,
      refreshToken: undefined,
      connected: false,
      updatedAt: Date.now(),
    });
    return existing._id;
  },
});

export const setGoogleEventId = mutation({
  args: {
    reservationId: v.id("reservations"),
    googleEventId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reservationId, {
      googleEventId: args.googleEventId,
      updatedAt: Date.now(),
    });
    return args.reservationId;
  },
});
