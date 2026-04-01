import { action, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

/** Inserta saltos de línea para legibilidad cuando el LLM responde todo junto. */
function formatForWhatsApp(text: string): string {
  let out = text.trim();
  out = out.replace(/\s+(https?:\/\/[^\s]+)/g, "\n\n$1");
  out = out.replace(/\s+¿/g, "\n\n¿");
  out = out.replace(/([.!?])\s+([A-Z¡])/g, "$1\n\n$2");
  return out.trim();
}

/**
 * Envía un mensaje de texto a WhatsApp vía API de YCloud y lo guarda en nuestra DB.
 * Requiere API Key y número de negocio configurados en Integraciones.
 */
export const sendWhatsAppMessage = action({
  args: {
    tenantId: v.id("tenants"),
    conversationId: v.id("conversations"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const contentTrimmed = formatForWhatsApp(args.content);
    if (!contentTrimmed) throw new Error("El mensaje no puede estar vacío");

    const integration = await ctx.runQuery(
      api.integrations.getYCloudForSend,
      { tenantId: args.tenantId }
    );
    if (!integration) {
      throw new Error(
        "Falta configurar API Key y número de negocio en Integraciones"
      );
    }

    const conversation = await ctx.runQuery(
      api.conversations.get,
      { conversationId: args.conversationId }
    );
    if (!conversation || conversation.tenantId !== args.tenantId) {
      throw new Error("Conversación no encontrada");
    }

    const toRaw = conversation.externalContactId
      .replace(/^whatsapp:/, "")
      .trim()
      .replace(/\s/g, "");
    const to = toRaw.startsWith("+") ? toRaw : `+${toRaw}`;
    const fromRaw = integration.phoneNumber.trim().replace(/\s/g, "");
    const from = fromRaw.startsWith("+") ? fromRaw : `+${fromRaw}`;

    const res = await fetch("https://api.ycloud.com/v2/whatsapp/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": integration.apiKey,
      },
      body: JSON.stringify({
        from,
        to,
        type: "text",
        text: { body: contentTrimmed },
      }),
    });

    const data = (await res.json()) as { id?: string; status?: string; message?: string };
    if (!res.ok) {
      const errMsg = data.message ?? data.status ?? res.statusText;
      throw new Error(`Error YCloud: ${errMsg}`);
    }

    await ctx.runMutation(api.messages.add, {
      conversationId: args.conversationId,
      tenantId: args.tenantId,
      direction: "OUTBOUND",
      content: contentTrimmed,
      providerMessageId: data.id,
    });

    return { ok: true, ycloudId: data.id };
  },
});

/**
 * Programa el procesamiento del mensaje entrante en segundo plano.
 * El webhook retorna 200 de inmediato para evitar timeout de YCloud.
 */
export const scheduleInboundProcessing = mutation({
  args: {
    tenantId: v.id("tenants"),
    eventId: v.string(),
    contactId: v.string(),
    customerName: v.string(),
    channel: v.union(
      v.literal("whatsapp"),
      v.literal("messenger"),
      v.literal("webchat")
    ),
    text: v.string(),
    mediaUrl: v.optional(v.string()),
    mediaType: v.optional(
      v.union(
        v.literal("image"),
        v.literal("video"),
        v.literal("audio"),
        v.literal("document")
      )
    ),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.system.ycloud.processInboundMessage, args);
  },
});

/** Genera URL para subir media (imagen, audio). */
export const generateMediaUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Envía imagen o audio a WhatsApp vía YCloud.
 * Requiere storageId de un archivo previamente subido con generateMediaUploadUrl.
 */
export const sendWhatsAppMedia = action({
  args: {
    tenantId: v.id("tenants"),
    conversationId: v.id("conversations"),
    storageId: v.id("_storage"),
    mediaType: v.union(v.literal("image"), v.literal("audio"), v.literal("document")),
    caption: v.optional(v.string()),
    fileName: v.optional(v.string()),
    contentType: v.optional(v.string()), // ej. audio/mp4, audio/ogg
    siteUrl: v.optional(v.string()), // URL base convex.site para proxy (audio)
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(
      api.integrations.getYCloudForSend,
      { tenantId: args.tenantId }
    );
    if (!integration) {
      throw new Error(
        "Falta configurar API Key y número de negocio en Integraciones"
      );
    }

    const conversation = await ctx.runQuery(
      api.conversations.get,
      { conversationId: args.conversationId }
    );
    if (!conversation || conversation.tenantId !== args.tenantId) {
      throw new Error("Conversación no encontrada");
    }

    let url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Archivo no encontrado o no accesible");

    // Para audio: usar proxy con Content-Type correcto (Convex sirve octet-stream).
    const siteUrl = process.env.CONVEX_SITE_URL ?? args.siteUrl;
    if (args.mediaType === "audio" && siteUrl && args.contentType) {
      const base = siteUrl.replace(/\/$/, "");
      url = `${base}/media/proxy?storageId=${args.storageId}&contentType=${encodeURIComponent(args.contentType)}`;
    }

    const toRaw = conversation.externalContactId
      .replace(/^whatsapp:/, "")
      .trim()
      .replace(/\s/g, "");
    const to = toRaw.startsWith("+") ? toRaw : `+${toRaw}`;
    const fromRaw = integration.phoneNumber.trim().replace(/\s/g, "");
    const from = fromRaw.startsWith("+") ? fromRaw : `+${fromRaw}`;

    const body: Record<string, unknown> = {
      from,
      to,
    };
    if (args.mediaType === "image") {
      body.type = "image";
      body.image = { link: url, ...(args.caption ? { caption: args.caption } : {}) };
    } else if (args.mediaType === "audio") {
      body.type = "audio";
      body.audio = { link: url };
    } else if (args.mediaType === "document") {
      body.type = "document";
      body.document = {
        link: url,
        ...(args.caption ? { caption: args.caption } : {}),
        ...(args.fileName ? { filename: args.fileName } : {}),
      };
    }

    const res = await fetch("https://api.ycloud.com/v2/whatsapp/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": integration.apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as { id?: string; status?: string; message?: string };
    if (!res.ok) {
      const errMsg = data.message ?? data.status ?? res.statusText;
      throw new Error(`Error YCloud: ${errMsg}`);
    }

    await ctx.runMutation(api.messages.add, {
      conversationId: args.conversationId,
      tenantId: args.tenantId,
      direction: "OUTBOUND",
      content: args.caption ?? "",
      mediaUrl: url,
      mediaType: args.mediaType,
      providerMessageId: data.id,
    });

    return { ok: true, ycloudId: data.id };
  },
});
