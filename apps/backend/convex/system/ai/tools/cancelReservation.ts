import { createTool } from "@convex-dev/agent";
import { jsonSchema } from "ai";
import { api, internal } from "../../../_generated/api";
import type { Doc } from "../../../_generated/dataModel";

function pickReservationForChat(rows: Doc<"reservations">[]): Doc<"reservations"> | null {
  const now = Date.now();
  const active = rows.filter((r) => r.status === "confirmed" || r.status === "pending");
  if (active.length === 0) return null;
  const upcoming = active.filter((r) => r.startTime >= now).sort((a, b) => a.startTime - b.startTime);
  if (upcoming.length > 0) return upcoming[0];
  return active.sort((a, b) => b.startTime - a.startTime)[0];
}

/**
 * Cancela la reserva activa de esta conversación de WhatsApp (la próxima en el tiempo, o la más reciente).
 */
export const cancelReservation = createTool({
  description:
    "Cancelar la reserva del cliente en este chat. Úsala cuando pida cancelar, anular, ya no ir, etc. Solo aplica a reservas creadas por este mismo chat.",
  args: jsonSchema<{ reason?: string }>({
    type: "object",
    properties: {
      reason: { type: "string", description: "Motivo opcional" },
    },
    additionalProperties: false,
  }),
  handler: async (ctx, _args) => {
    if (!ctx.threadId) return "Falta el ID del hilo.";

    const conversation = await ctx.runQuery(internal.system.conversations.getByThreadId, {
      threadId: ctx.threadId,
    });
    if (!conversation) return "Conversación no encontrada.";

    const tenant = await ctx.runQuery(api.tenants.get, { tenantId: conversation.tenantId });
    if (tenant?.enabledModules?.reservas === false) {
      return "Este restaurante no tiene reservas por este canal.";
    }

    const list = await ctx.runQuery(api.reservations.listActiveByConversation, {
      conversationId: conversation._id,
    });
    const target = pickReservationForChat(list);
    if (!target) {
      return "No encontré una reserva activa asociada a este chat para cancelar. Si la reserva fue por otro medio, contacta al restaurante.";
    }

    try {
      await ctx.runMutation(api.reservations.cancel, { reservationId: target._id });
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }

    const msg =
      "Listo, tu reserva quedó cancelada. Si quieres agendar otra fecha u hora, dímelo y te ayudo.";
    try {
      await ctx.runAction(api.ycloud.sendWhatsAppMessage, {
        tenantId: conversation.tenantId,
        conversationId: conversation._id,
        content: msg,
      });
    } catch {
      /* el return informa al agente */
    }
    return msg;
  },
});
