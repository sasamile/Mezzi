import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/** Sentinel de acceso a chats sin clasificar (ver conversationFolders.UNCLASSIFIED). */
const UNCLASSIFIED = "__unclassified__";

/**
 * Filtra una lista de conversaciones según los permisos de carpeta del usuario.
 * - Sin userId, sin membresía, rol OWNER/ADMIN o allowedFolders undefined → ve todo.
 * - En otro caso: solo chats cuyas carpetas intersecten allowedFolders, más los
 *   "sin clasificar" si allowedFolders incluye el sentinel UNCLASSIFIED.
 */
async function filterByFolderAccess(
  ctx: QueryCtx,
  tenantId: Id<"tenants">,
  userId: Id<"users"> | undefined,
  conversations: Doc<"conversations">[]
): Promise<Doc<"conversations">[]> {
  if (!userId) return conversations;
  const membership = await ctx.db
    .query("userTenants")
    .withIndex("by_user_tenant", (q) =>
      q.eq("userId", userId).eq("tenantId", tenantId)
    )
    .unique();
  if (!membership) return conversations;
  if (membership.role === "OWNER" || membership.role === "ADMIN")
    return conversations;
  const allowed = membership.allowedFolders;
  if (!allowed) return conversations; // undefined = todas (compatibilidad)
  const allowedSet = new Set(allowed);
  const canSeeUnclassified = allowedSet.has(UNCLASSIFIED);
  return conversations.filter((c) => {
    const folders = c.folderIds ?? [];
    if (folders.length === 0) return canSeeUnclassified;
    return folders.some((id) => allowedSet.has(String(id)));
  });
}

const channelValidator = v.union(
  v.literal("whatsapp"),
  v.literal("messenger"),
  v.literal("webchat")
);
const statusValidator = v.union(
  v.literal("open"),
  v.literal("closed"),
  v.literal("pending")
);
const priorityValidator = v.union(
  v.literal("low"),
  v.literal("normal"),
  v.literal("high"),
  v.literal("urgent")
);

export const listByTenant = query({
  args: {
    tenantId: v.id("tenants"),
    /** Si se pasa, filtra según los permisos de carpeta del usuario. */
    userId: v.optional(v.id("users")),
    /** Límite duro (default 80). Evita full-scan del tenant. */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 80, 1), 150);
    const batch = await ctx.db
      .query("conversations")
      .withIndex("by_tenant_last_message", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(limit);
    return await filterByFolderAccess(ctx, args.tenantId, args.userId, batch);
  },
});

/**
 * Lista paginada (scroll infinito del sidebar).
 * Usa el índice by_tenant_last_message — no lee todo el tenant.
 */
export const listByTenantPaginated = query({
  args: {
    tenantId: v.id("tenants"),
    userId: v.optional(v.id("users")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("conversations")
      .withIndex("by_tenant_last_message", (q) =>
        q.eq("tenantId", args.tenantId)
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await filterByFolderAccess(
      ctx,
      args.tenantId,
      args.userId,
      result.page
    );

    return {
      ...result,
      page,
    };
  },
});

export const countNeedingAttention = query({
  args: {
    tenantId: v.id("tenants"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("conversations")
      .withIndex("by_tenant_status", (q) =>
        q.eq("tenantId", args.tenantId).eq("status", "pending")
      )
      .collect();
    const visible = await filterByFolderAccess(
      ctx,
      args.tenantId,
      args.userId,
      pending
    );
    return visible.length;
  },
});

export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId);
  },
});

export const getOrCreate = mutation({
  args: {
    tenantId: v.id("tenants"),
    externalContactId: v.string(),
    customerName: v.string(),
    channel: channelValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_tenant_contact", (q) =>
        q.eq("tenantId", args.tenantId).eq("externalContactId", args.externalContactId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastMessageAt: now,
        updatedAt: now,
        customerName: args.customerName,
      });
      return existing._id;
    }

    return await ctx.db.insert("conversations", {
      tenantId: args.tenantId,
      externalContactId: args.externalContactId,
      customerName: args.customerName,
      channel: args.channel,
      status: "open",
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateStatus = mutation({
  args: {
    conversationId: v.id("conversations"),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.conversationId, { status: args.status, updatedAt: now });
    return args.conversationId;
  },
});

export const updatePriority = mutation({
  args: {
    conversationId: v.id("conversations"),
    priority: v.union(priorityValidator, v.null()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.conversationId, {
      priority: args.priority ?? undefined,
      updatedAt: now,
    });
    return args.conversationId;
  },
});

export const updateAssignedTo = mutation({
  args: {
    conversationId: v.id("conversations"),
    userId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.conversationId, {
      assignedTo: args.userId ?? undefined,
      updatedAt: now,
    });
    return args.conversationId;
  },
});
