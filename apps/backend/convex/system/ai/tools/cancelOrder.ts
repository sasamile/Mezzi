import { createTool } from "@convex-dev/agent";
import { jsonSchema } from "ai";
import { api, internal } from "../../../_generated/api";

/**
 * Cancela el pedido más reciente de la conversación (no lo elimina).
 * Usar cuando el cliente pida cancelar o no quiera el pedido.
 */
export const cancelOrder = createTool({
  description:
    'Cancelar el pedido anterior. Úsala cuando el cliente diga que no quiere el pedido, que lo cancele, "cancélenlo", "no lo quiero", etc. NO elimina el pedido; lo marca como cancelado.',
  args: jsonSchema<{
    reason?: string;
  }>({
    type: "object",
    properties: {
      reason: { type: "string", description: "Razón opcional (ej. cliente cambió de opinión)" },
    },
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
      return "Este restaurante no tiene habilitado el módulo de pedidos. No puedo cancelar pedidos por este canal.";
    }

    const lastOrder = await ctx.runQuery(api.requests.getLastByConversationId, {
      conversationId: conversation._id,
    });
    if (!lastOrder) return "No encontré un pedido reciente para cancelar.";

    if (lastOrder.status !== "pending") {
      return "Ese pedido ya fue despachado y no se puede cancelar. Escríbele al restaurante si necesitas algo.";
    }

    await ctx.runMutation(api.requests.update, {
      requestId: lastOrder._id,
      status: "cancelled",
    });

    const msg = "Pedido cancelado. Si cambias de opinión, escríbenos y te ayudamos.";
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
