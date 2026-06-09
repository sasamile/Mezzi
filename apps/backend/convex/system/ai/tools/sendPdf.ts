import { createTool } from "@convex-dev/agent";
import { jsonSchema } from "ai";
import { api, internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { isPdfsModuleEnabled } from "../../alcarbon";

interface TenantPdf {
  _id: Id<"tenantPdfs">;
  label: string;
  storageId: Id<"_storage">;
  fileName: string;
  url: string | null;
}

/**
 * Envía uno de los PDFs configurados del restaurante al cliente por WhatsApp.
 * El agente elige el label correcto según el contexto de la conversación.
 */
export const sendPdf = createTool({
  description:
    "Enviar un PDF al cliente por WhatsApp (menú, decoraciones, promociones, etc.). " +
    "Usa el label exacto del PDF que necesitas enviar. " +
    "Si no sabes qué labels hay disponibles, deja label vacío para que el sistema los liste.",
  args: jsonSchema<{ label: string }>({
    type: "object",
    properties: {
      label: {
        type: "string",
        description:
          'Nombre del PDF a enviar, tal como está configurado. Ej: "Menú", "Decoraciones", "Promociones".',
      },
    },
    required: ["label"],
    additionalProperties: false,
  }),
  handler: async (ctx, args) => {
    if (!ctx.threadId) return "Falta el ID del hilo.";

    const conversation = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      { threadId: ctx.threadId }
    );
    if (!conversation) return "Conversación no encontrada.";

    const tenant = await ctx.runQuery(api.tenants.get, {
      tenantId: conversation.tenantId,
    });
    if (!isPdfsModuleEnabled(tenant)) {
      return "Este restaurante no tiene habilitado el envío de PDFs por WhatsApp.";
    }

    const allPdfs = (await ctx.runQuery(api.pdfs.list, {
      tenantId: conversation.tenantId,
    })) as TenantPdf[];

    if (!allPdfs || allPdfs.length === 0) {
      return "Este restaurante no tiene PDFs configurados. Usa searchTool para buscar la información.";
    }

    // Buscar coincidencia exacta primero, luego parcial (case-insensitive)
    const labelLower = args.label.trim().toLowerCase();
    const match: TenantPdf | undefined =
      allPdfs.find((p: TenantPdf) => p.label.toLowerCase() === labelLower) ??
      allPdfs.find((p: TenantPdf) => p.label.toLowerCase().includes(labelLower)) ??
      allPdfs.find((p: TenantPdf) => labelLower.includes(p.label.toLowerCase()));

    if (!match) {
      const available = allPdfs.map((p: TenantPdf) => `"${p.label}"`).join(", ");
      return `No encontré un PDF con el label "${args.label}". PDFs disponibles: ${available}. Llama de nuevo con uno de estos labels.`;
    }

    try {
      await ctx.runAction(api.ycloud.sendWhatsAppMedia, {
        tenantId: conversation.tenantId,
        conversationId: conversation._id,
        storageId: match.storageId,
        mediaType: "document",
        caption: `Aquí tienes: *${match.label}* 📄`,
        fileName: match.fileName.toLowerCase().endsWith(".pdf")
          ? match.fileName
          : `${match.fileName}.pdf`,
      });
      return `PDF "${match.label}" enviado correctamente al cliente.`;
    } catch (err) {
      return `No se pudo enviar el PDF "${match.label}": ${err instanceof Error ? err.message : String(err)}. Usa searchTool como alternativa.`;
    }
  },
});
