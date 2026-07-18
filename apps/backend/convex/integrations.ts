import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertTenantOwner } from "./lib/tenantAccess";

export const getYCloud = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("tenantIntegrations")
      .withIndex("by_tenant_provider", (q) =>
        q.eq("tenantId", args.tenantId).eq("provider", "YCLOUD")
      )
      .first();
    if (!row) return null;
    const { apiKey, ...rest } = row;
    return { ...rest, hasApiKey: !!apiKey };
  },
});

export const saveYCloud = mutation({
  args: {
    actorUserId: v.id("users"),
    tenantId: v.id("tenants"),
    apiKey: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
    connected: v.optional(v.boolean()), // solo para desconectar manualmente
  },
  handler: async (ctx, args) => {
    await assertTenantOwner(ctx, args.tenantId, args.actorUserId);
    const now = Date.now();
    const existing = await ctx.db
      .query("tenantIntegrations")
      .withIndex("by_tenant_provider", (q) =>
        q.eq("tenantId", args.tenantId).eq("provider", "YCLOUD")
      )
      .first();

    const webhookPath = existing
      ? existing.webhookPath
      : `tenant_${args.tenantId}_${now.toString(36)}`;

    if (existing) {
      const updates: Record<string, unknown> = {
        apiKey: args.apiKey !== undefined ? args.apiKey : existing.apiKey,
        phoneNumber: args.phoneNumber ?? existing.phoneNumber,
        webhookSecret: args.webhookSecret ?? existing.webhookSecret,
        updatedAt: now,
      };
      // Solo permitir desconectar manualmente; connected: true viene del webhook
      if (args.connected === false) updates.connected = false;
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    // Nueva integración: siempre pendiente hasta que webhook reciba mensaje
    return await ctx.db.insert("tenantIntegrations", {
      tenantId: args.tenantId,
      provider: "YCLOUD",
      apiKey: args.apiKey,
      phoneNumber: args.phoneNumber,
      webhookSecret: args.webhookSecret,
      webhookPath,
      connected: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Usado internamente por la action sendWhatsAppMessage (no exponer apiKey al cliente). */
export const getYCloudForSend = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("tenantIntegrations")
      .withIndex("by_tenant_provider", (q) =>
        q.eq("tenantId", args.tenantId).eq("provider", "YCLOUD")
      )
      .first();
    if (!row?.apiKey || !row?.phoneNumber) return null;
    return { apiKey: row.apiKey, phoneNumber: row.phoneNumber };
  },
});

/** Marca YCloud como conectado (llamado desde webhook al recibir primer mensaje). */
export const markYCloudConnected = mutation({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tenantIntegrations")
      .withIndex("by_tenant_provider", (q) =>
        q.eq("tenantId", args.tenantId).eq("provider", "YCLOUD")
      )
      .first();
    if (!existing) return null;
    await ctx.db.patch(existing._id, {
      connected: true,
      updatedAt: Date.now(),
    });
    return existing._id;
  },
});

export const regenerateWebhookPath = mutation({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("tenantIntegrations")
      .withIndex("by_tenant_provider", (q) =>
        q.eq("tenantId", args.tenantId).eq("provider", "YCLOUD")
      )
      .first();
    if (!existing) throw new Error("No existe integración YCloud para este tenant");
    const webhookPath = `tenant_${args.tenantId}_${now.toString(36)}`;
    await ctx.db.patch(existing._id, { webhookPath, updatedAt: now });
    return existing._id;
  },
});
