import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("asc")
      .collect();
  },
});

export const add = mutation({
  args: {
    conversationId: v.id("conversations"),
    tenantId: v.id("tenants"),
    direction: v.union(v.literal("INBOUND"), v.literal("OUTBOUND")),
    content: v.string(),
    mediaUrl: v.optional(v.string()),
    mediaType: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("audio"), v.literal("document"))),
    providerMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const preview =
      args.mediaType === "image"
        ? "Imagen"
        : args.mediaType === "video"
          ? "Video"
          : args.mediaType === "audio"
            ? "Audio"
            : args.mediaType === "document"
              ? "Documento"
              : args.content.trim().slice(0, 50) + (args.content.length > 50 ? "…" : "");
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      updatedAt: now,
      lastMessagePreview: preview,
      lastMessageDirection: args.direction,
    });
    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      tenantId: args.tenantId,
      direction: args.direction,
      type: "TEXT",
      content: args.content,
      mediaUrl: args.mediaUrl,
      mediaType: args.mediaType,
      providerMessageId: args.providerMessageId,
      createdAt: now,
    });
  },
});

/**
 * Devuelve el contenido del último mensaje OUTBOUND (respuesta del bot) en la
 * conversación indicada. Usado en ycloud.ts para resolver respuestas numéricas.
 */
export const getLastOutboundMessage = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const msg = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .filter((q) => q.eq(q.field("direction"), "OUTBOUND"))
      .first();
    return msg?.content ?? null;
  },
});

/**
 * Devuelve los últimos N mensajes de la conversación (ambas direcciones),
 * ordenados cronológicamente. Usado para construir historial multi-turno
 * que evita que el modelo pierda contexto y repita preguntas.
 */
export const getRecentMessages = internalQuery({
  args: {
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(limit);
    return msgs.reverse().map((m) => ({
      direction: m.direction,
      content: m.content,
    }));
  },
});

/**
 * Devuelve todos los mensajes INBOUND recibidos desde el último mensaje OUTBOUND
 * (es decir, los mensajes pendientes de respuesta del bot).
 * Usado por el debounce para acumular mensajes antes de procesar con IA.
 */
export const getInboundSinceLastOutbound = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .take(50);

    // En orden desc, el primer OUTBOUND "corta" los mensajes del usuario
    const lastOutboundIdx = msgs.findIndex((m) => m.direction === "OUTBOUND");
    const inbound =
      lastOutboundIdx === -1
        ? msgs.filter((m) => m.direction === "INBOUND")
        : msgs.slice(0, lastOutboundIdx).filter((m) => m.direction === "INBOUND");

    return inbound.reverse().map((m) => ({
      content: m.content,
      mediaUrl: m.mediaUrl,
      mediaType: m.mediaType,
    }));
  },
});

/** Rellena lastMessagePreview en conversaciones existentes (ejecutar una vez). */
function buildPreview(msg: { content: string; mediaType?: string }) {
  if (msg.mediaType === "image") return "Imagen";
  if (msg.mediaType === "video") return "Video";
  if (msg.mediaType === "audio") return "Audio";
  if (msg.mediaType === "document") return "Documento";
  const t = msg.content.trim();
  return t.slice(0, 50) + (t.length > 50 ? "…" : "");
}

export const backfillLastMessagePreviews = mutation({
  args: {},
  handler: async (ctx) => {
    const conversations = await ctx.db.query("conversations").collect();
    let updated = 0;
    for (const conv of conversations) {
      const lastMsg = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", conv._id))
        .order("desc")
        .first();
      if (!lastMsg) continue;
      const preview = buildPreview(lastMsg);
      await ctx.db.patch(conv._id, {
        lastMessagePreview: preview,
        lastMessageDirection: lastMsg.direction,
      });
      updated++;
    }
    return { updated, total: conversations.length };
  },
});
