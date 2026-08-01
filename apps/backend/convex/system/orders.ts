import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";

const MESSAGE_RECEIVED =
  "Su pedido ha sido recibido. Lo estamos preparando. Te avisaremos cuando esté en camino.";
const MESSAGE_DISPATCHED =
  "Su pedido ha sido despachado. Esté atento a la entrega. ¡Gracias por su compra!";
const MESSAGE_DELIVERED =
  "Su pedido ha sido entregado. ¡Gracias por su compra! Esperamos que disfrutes.";

/**
 * Se ejecuta cuando se crea un pedido con contacto para notificar.
 */
export const notifyOrderCreated = internalAction({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const order = await ctx.runQuery(api.requests.get, {
      requestId: args.requestId,
    });
    if (!order || order.status !== "pending") return;
    if (!order.conversationId && !order.customerPhone?.trim()) return;
    const content = MESSAGE_RECEIVED;
    if (order.conversationId) {
      await ctx.runAction(internal.ycloud.sendWhatsAppMessageInternal, {
        tenantId: order.tenantId,
        conversationId: order.conversationId,
        content,
      });
    } else if (order.customerPhone?.trim()) {
      await ctx.runAction(internal.system.ycloud.sendWhatsAppToPhone, {
        tenantId: order.tenantId,
        phoneNumber: order.customerPhone.trim(),
        content,
      });
    }
  },
});

/**
 * Se ejecuta cuando un pedido pasa a estado "sent" (despachado).
 */
export const notifyOrderDispatched = internalAction({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const order = await ctx.runQuery(api.requests.get, {
      requestId: args.requestId,
    });
    if (!order || order.status !== "sent") return;
    const content = MESSAGE_DISPATCHED;
    if (order.conversationId) {
      await ctx.runAction(internal.ycloud.sendWhatsAppMessageInternal, {
        tenantId: order.tenantId,
        conversationId: order.conversationId,
        content,
      });
    } else if (order.customerPhone?.trim()) {
      await ctx.runAction(internal.system.ycloud.sendWhatsAppToPhone, {
        tenantId: order.tenantId,
        phoneNumber: order.customerPhone.trim(),
        content,
      });
    }
  },
});

/**
 * Se ejecuta cuando un pedido pasa a estado "delivered" (entregado).
 */
export const notifyOrderDelivered = internalAction({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    const order = await ctx.runQuery(api.requests.get, {
      requestId: args.requestId,
    });
    if (!order || order.status !== "delivered") return;
    const content = MESSAGE_DELIVERED;
    if (order.conversationId) {
      await ctx.runAction(internal.ycloud.sendWhatsAppMessageInternal, {
        tenantId: order.tenantId,
        conversationId: order.conversationId,
        content,
      });
    } else if (order.customerPhone?.trim()) {
      await ctx.runAction(internal.system.ycloud.sendWhatsAppToPhone, {
        tenantId: order.tenantId,
        phoneNumber: order.customerPhone.trim(),
        content,
      });
    }
  },
});
