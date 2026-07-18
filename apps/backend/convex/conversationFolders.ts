import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

/**
 * Sentinel usado en userTenants.allowedFolders para representar el acceso a los
 * chats "Sin clasificar" (los que no pertenecen a ninguna carpeta).
 */
export const UNCLASSIFIED = "__unclassified__";

/** Carpetas por defecto que se siembran la primera vez para un tenant. */
const DEFAULT_FOLDERS: {
  name: string;
  color: string;
  icon: string;
  keywords: string[];
}[] = [
  {
    name: "Facturas",
    color: "#2563eb",
    icon: "FileText",
    keywords: ["factura", "facturacion", "facturación", "cuenta de cobro", "rut", "iva"],
  },
  {
    name: "Proveedores",
    color: "#7c3aed",
    icon: "Truck",
    keywords: ["proveedor", "proveedores", "insumo", "insumos", "cotizacion", "cotización", "pedido de compra"],
  },
  {
    name: "Recursos Humanos",
    color: "#059669",
    icon: "Users",
    keywords: ["hoja de vida", "vacante", "empleo", "trabajo", "curriculum", "cv", "contratacion", "contratación", "nomina", "nómina"],
  },
  {
    name: "Compras",
    color: "#d97706",
    icon: "ShoppingCart",
    keywords: ["compra", "compras", "orden de compra", "abastecimiento"],
  },
];

/** Normaliza texto: minúsculas + sin acentos, para matching robusto. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export const listByTenant = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const folders = await ctx.db
      .query("conversationFolders")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    return folders.sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt
    );
  },
});

export const create = mutation({
  args: {
    tenantId: v.id("tenants"),
    name: v.string(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("El nombre de la carpeta es obligatorio");
    const existing = await ctx.db
      .query("conversationFolders")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    if (existing.some((f) => normalize(f.name) === normalize(name))) {
      throw new Error("Ya existe una carpeta con ese nombre");
    }
    const now = Date.now();
    return await ctx.db.insert("conversationFolders", {
      tenantId: args.tenantId,
      name,
      color: args.color,
      icon: args.icon,
      keywords: args.keywords?.map((k) => k.trim()).filter(Boolean),
      order: existing.length,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    folderId: v.id("conversationFolders"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder) throw new Error("Carpeta no encontrada");
    const patch: Partial<Doc<"conversationFolders">> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("El nombre de la carpeta es obligatorio");
      patch.name = name;
    }
    if (args.color !== undefined) patch.color = args.color;
    if (args.icon !== undefined) patch.icon = args.icon;
    if (args.keywords !== undefined)
      patch.keywords = args.keywords.map((k) => k.trim()).filter(Boolean);
    if (args.order !== undefined) patch.order = args.order;
    await ctx.db.patch(args.folderId, patch);
    return args.folderId;
  },
});

/**
 * Elimina una carpeta y la quita de todas las conversaciones que la tuvieran, y
 * de los permisos (allowedFolders) de los usuarios del tenant.
 */
export const remove = mutation({
  args: { folderId: v.id("conversationFolders") },
  handler: async (ctx, args) => {
    const folder = await ctx.db.get(args.folderId);
    if (!folder) return args.folderId;
    const tenantId = folder.tenantId;

    const convs = await ctx.db
      .query("conversations")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect();
    for (const c of convs) {
      if (c.folderIds?.some((id) => id === args.folderId)) {
        await ctx.db.patch(c._id, {
          folderIds: c.folderIds.filter((id) => id !== args.folderId),
        });
      }
    }

    const memberships = await ctx.db
      .query("userTenants")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect();
    const folderKey = String(args.folderId);
    for (const m of memberships) {
      if (m.allowedFolders?.includes(folderKey)) {
        await ctx.db.patch(m._id, {
          allowedFolders: m.allowedFolders.filter((k) => k !== folderKey),
        });
      }
    }

    await ctx.db.delete(args.folderId);
    return args.folderId;
  },
});

/**
 * Define exactamente el conjunto de carpetas de una conversación (mover / asignar
 * manualmente desde el inbox).
 */
export const setConversationFolders = mutation({
  args: {
    conversationId: v.id("conversations"),
    folderIds: v.array(v.id("conversationFolders")),
  },
  handler: async (ctx, args) => {
    const unique = [...new Set(args.folderIds)];
    await ctx.db.patch(args.conversationId, {
      folderIds: unique,
      updatedAt: Date.now(),
    });
    return args.conversationId;
  },
});

/** Agrega o quita una sola carpeta de una conversación. */
export const toggleConversationFolder = mutation({
  args: {
    conversationId: v.id("conversations"),
    folderId: v.id("conversationFolders"),
    present: v.boolean(),
  },
  handler: async (ctx, args) => {
    const conv = await ctx.db.get(args.conversationId);
    if (!conv) throw new Error("Conversación no encontrada");
    const current = conv.folderIds ?? [];
    const next = args.present
      ? [...new Set([...current, args.folderId])]
      : current.filter((id) => id !== args.folderId);
    await ctx.db.patch(args.conversationId, {
      folderIds: next,
      updatedAt: Date.now(),
    });
    return args.conversationId;
  },
});

/** Crea las carpetas por defecto si el tenant aún no tiene ninguna. */
export const seedDefaults = mutation({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversationFolders")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .first();
    if (existing) return { created: 0 };
    const now = Date.now();
    let order = 0;
    for (const f of DEFAULT_FOLDERS) {
      await ctx.db.insert("conversationFolders", {
        tenantId: args.tenantId,
        name: f.name,
        color: f.color,
        icon: f.icon,
        keywords: f.keywords,
        order: order++,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { created: DEFAULT_FOLDERS.length };
  },
});

/**
 * Setup one-shot para un tenant: siembra las carpetas por defecto (si no tiene) y
 * reclasifica TODAS las conversaciones existentes según las keywords, mirando su
 * historial de mensajes entrantes. Idempotente: solo agrega carpetas que falten.
 */
export const setupAndClassifyExisting = mutation({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    // 1) Sembrar carpetas por defecto si aún no hay ninguna.
    const existingFolders = await ctx.db
      .query("conversationFolders")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    let folders = existingFolders;
    if (folders.length === 0) {
      const now = Date.now();
      let order = 0;
      for (const f of DEFAULT_FOLDERS) {
        await ctx.db.insert("conversationFolders", {
          tenantId: args.tenantId,
          name: f.name,
          color: f.color,
          icon: f.icon,
          keywords: f.keywords,
          order: order++,
          createdAt: now,
          updatedAt: now,
        });
      }
      folders = await ctx.db
        .query("conversationFolders")
        .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
        .collect();
    }

    // 2) Reclasificar conversaciones existentes por su historial entrante.
    const convs = await ctx.db
      .query("conversations")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    let updated = 0;
    for (const conv of convs) {
      // Últimos 100 mensajes de la conversación; usamos los INBOUND (intención del cliente).
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
        .order("desc")
        .take(100);
      const text = normalize(
        msgs
          .filter((m) => m.direction === "INBOUND")
          .map((m) => m.content)
          .join(" ")
      );
      if (!text.trim()) continue;

      const matched: Id<"conversationFolders">[] = [];
      for (const folder of folders) {
        const kws = folder.keywords ?? [];
        if (kws.some((kw) => kw.trim() && text.includes(normalize(kw)))) {
          matched.push(folder._id);
        }
      }
      if (matched.length === 0) continue;

      const current = conv.folderIds ?? [];
      const next = [...new Set([...current, ...matched])];
      if (next.length === current.length) continue;
      await ctx.db.patch(conv._id, { folderIds: next });
      updated++;
    }

    return {
      folders: folders.length,
      conversations: convs.length,
      classified: updated,
    };
  },
});

/**
 * Clasificación automática por keywords: al llegar un mensaje INBOUND se revisan
 * las carpetas del tenant y se agregan (unión, sin duplicar) las que hagan match.
 * Se llama desde el pipeline de mensajes entrantes (system/ycloud.ts).
 */
export const autoClassify = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    tenantId: v.id("tenants"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const text = normalize(args.text);
    if (!text.trim()) return;
    const folders = await ctx.db
      .query("conversationFolders")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    if (folders.length === 0) return;

    const matched: Id<"conversationFolders">[] = [];
    for (const folder of folders) {
      const kws = folder.keywords ?? [];
      if (kws.some((kw) => kw.trim() && text.includes(normalize(kw)))) {
        matched.push(folder._id);
      }
    }
    if (matched.length === 0) return;

    const conv = await ctx.db.get(args.conversationId);
    if (!conv) return;
    const current = conv.folderIds ?? [];
    const next = [...new Set([...current, ...matched])];
    if (next.length === current.length) return; // nada nuevo
    await ctx.db.patch(args.conversationId, { folderIds: next });
  },
});
