import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  requireConversationAccess,
  requireTenantMember,
} from "./lib/session";

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

/**
 * Conversaciones del restaurante, filtradas por los permisos de carpeta del
 * usuario de la sesión.
 *
 * `userId` deja de ser argumento. Como opcional era doblemente inseguro:
 * cualquiera podía omitirlo para saltarse el filtro de carpetas
 * (`filterByFolderAccess` devuelve todo si no recibe userId), o pasar el de
 * otra persona. Ahora sale del token.
 */
export const listByTenant = query({
  args: {
    token: v.string(),
    tenantId: v.id("tenants"),
    /** Límite duro (default 80). Evita full-scan del tenant. */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireTenantMember(ctx, args.token, args.tenantId);

    const limit = Math.min(Math.max(args.limit ?? 80, 1), 150);
    const batch = await ctx.db
      .query("conversations")
      .withIndex("by_tenant_last_message", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(limit);
    return await filterByFolderAccess(ctx, args.tenantId, user._id, batch);
  },
});

/**
 * Lista paginada (scroll infinito del sidebar).
 * Usa el índice by_tenant_last_message — no lee todo el tenant.
 */
export const listByTenantPaginated = query({
  args: {
    token: v.string(),
    tenantId: v.id("tenants"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireTenantMember(ctx, args.token, args.tenantId);

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
      user._id,
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
    token: v.string(),
    tenantId: v.id("tenants"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireTenantMember(ctx, args.token, args.tenantId);

    const pending = await ctx.db
      .query("conversations")
      .withIndex("by_tenant_status", (q) =>
        q.eq("tenantId", args.tenantId).eq("status", "pending")
      )
      .collect();
    const visible = await filterByFolderAccess(
      ctx,
      args.tenantId,
      user._id,
      pending
    );
    return visible.length;
  },
});

/** Lectura interna, sin sesión: la usan el webhook y las acciones del bot. */
export const getInternal = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId);
  },
});

/** Puerta pública: exige sesión con acceso al restaurante de la conversación. */
export const get = query({
  args: {
    token: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const { conversation } = await requireConversationAccess(
      ctx,
      args.token,
      args.conversationId
    );
    return conversation;
  },
});

/**
 * INTERNA: no tenía ningún llamador —el bot usa
 * `internal.system.conversations.getOrCreateForAgent`— y como mutación pública
 * permitía a cualquiera crear conversaciones falsas en cualquier restaurante.
 */
export const getOrCreate = internalMutation({
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
    token: v.string(),
    conversationId: v.id("conversations"),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    await requireConversationAccess(ctx, args.token, args.conversationId);

    const now = Date.now();
    await ctx.db.patch(args.conversationId, { status: args.status, updatedAt: now });
    return args.conversationId;
  },
});

/** Interna: el bot marca prioridad al detectar urgencia, sin usuario detrás. */
export const updatePriorityInternal = internalMutation({
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

export const updatePriority = mutation({
  args: {
    token: v.string(),
    conversationId: v.id("conversations"),
    priority: v.union(priorityValidator, v.null()),
  },
  handler: async (ctx, args) => {
    await requireConversationAccess(ctx, args.token, args.conversationId);

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
    token: v.string(),
    conversationId: v.id("conversations"),
    userId: v.union(v.id("users"), v.null()),
  },
  handler: async (ctx, args) => {
    const { conversation } = await requireConversationAccess(
      ctx,
      args.token,
      args.conversationId
    );

    // El asignado debe pertenecer al mismo restaurante: si no, se podría
    // "asignar" un chat a alguien de otro tenant y filtrarle el acceso.
    if (args.userId) {
      const membership = await ctx.db
        .query("userTenants")
        .withIndex("by_user_tenant", (q) =>
          q.eq("userId", args.userId!).eq("tenantId", conversation.tenantId)
        )
        .unique();
      if (!membership) {
        throw new Error("El usuario no pertenece a este restaurante");
      }
    }

    const now = Date.now();
    await ctx.db.patch(args.conversationId, {
      assignedTo: args.userId ?? undefined,
      updatedAt: now,
    });
    return args.conversationId;
  },
});
