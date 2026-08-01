import { createTool } from "@convex-dev/agent";
import { jsonSchema } from "ai";
import { api, internal } from "../../../_generated/api";

/**
 * Actualiza el pedido más reciente de la conversación con notas adicionales
 * (ej. "sin cebolla", "sin picante"). Usar cuando el cliente dice que olvidó agregar algo.
 */
export const updateOrder = createTool({
  description:
    'Actualizar el pedido anterior con notas/observaciones. Úsala cuando el cliente diga que olvidó agregar algo (ej. "sin cebolla", "sin picante", "sin cilantro"). Actualiza el pedido más reciente de esta conversación.',
  args: jsonSchema<{
    notes: string;
  }>({
    type: "object",
    properties: {
      notes: { type: "string", description: "Lo que el cliente olvidó agregar, ej. sin cebolla, sin picante" },
    },
    required: ["notes"],
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
    if (tenant?.enabledModules?.pedidos === false) {
      return "Este restaurante no tiene habilitado el módulo de pedidos. No puedo actualizar pedidos por este canal.";
    }

    const lastOrder = await ctx.runQuery(api.requests.getLastByConversationId, {
      conversationId: conversation._id,
    });
    if (!lastOrder) return "No encontré un pedido anterior en esta conversación para actualizar.";

    if (lastOrder.status !== "pending") {
      return "Ese pedido ya fue despachado. Para cambios, escríbele al restaurante.";
    }

    const newNotes = lastOrder.notes
      ? `${lastOrder.notes}. ${args.notes.trim()}`
      : args.notes.trim();

    await ctx.runMutation(api.requests.update, {
      requestId: lastOrder._id,
      notes: newNotes,
    });

    const msg = `Pedido actualizado. Se agregó: ${args.notes.trim()}. ¡Gracias por avisarnos!`;
    try {
      await ctx.runAction(internal.ycloud.sendWhatsAppMessageInternal, {
        tenantId: conversation.tenantId,
        conversationId: conversation._id,
        content: msg,
      });
    } catch {
      // Si falla el envío, el return igual informa al agente
    }
    return msg;
  },
});
