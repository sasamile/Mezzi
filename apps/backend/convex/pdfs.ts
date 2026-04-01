import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Lista todos los PDFs de un restaurante con su URL de descarga. */
export const list = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("tenantPdfs")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    return Promise.all(
      rows.map(async (r) => ({
        ...r,
        url: await ctx.storage.getUrl(r.storageId),
      }))
    );
  },
});

/** Guarda un nuevo PDF (o reemplaza uno existente por su label). */
export const save = mutation({
  args: {
    tenantId: v.id("tenants"),
    label: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const label = args.label.trim();
    const existing = await ctx.db
      .query("tenantPdfs")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .filter((q) => q.eq(q.field("label"), label))
      .first();

    if (existing) {
      try { await ctx.storage.delete(existing.storageId); } catch { /* ya eliminado */ }
      await ctx.db.patch(existing._id, {
        storageId: args.storageId,
        fileName: args.fileName,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("tenantPdfs", {
      tenantId: args.tenantId,
      label,
      storageId: args.storageId,
      fileName: args.fileName,
      updatedAt: Date.now(),
    });
  },
});

/** Elimina un PDF por su ID. */
export const remove = mutation({
  args: { pdfId: v.id("tenantPdfs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pdfId);
    if (!row) return;
    try { await ctx.storage.delete(row.storageId); } catch { /* ya eliminado */ }
    await ctx.db.delete(args.pdfId);
  },
});

/** Renombra el label de un PDF. */
export const rename = mutation({
  args: { pdfId: v.id("tenantPdfs"), label: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pdfId, {
      label: args.label.trim(),
      updatedAt: Date.now(),
    });
  },
});

/** Genera URL temporal para subir un PDF a Convex Storage. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});
