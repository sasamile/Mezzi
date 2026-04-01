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
 * Modifica la reserva activa de esta conversación (fecha, hora, personas, mesa, notas, teléfono).
 */
export const updateReservation = createTool({
  description:
    "Actualizar la reserva del cliente en este chat cuando pida cambiar fecha, hora, número de personas, mesa/zona, observaciones o teléfono. Pasa solo los campos que el cliente quiera cambiar.",
  args: jsonSchema<{
    date?: string;
    time?: string;
    numberOfPeople?: number;
    tableNumber?: string;
    notes?: string;
    customerPhone?: string;
  }>({
    type: "object",
    properties: {
      date: { type: "string", description: "Nueva fecha YYYY-MM-DD (opcional)" },
      time: { type: "string", description: "Nueva hora 24h ej. 17:00 (opcional)" },
      numberOfPeople: { type: "number", description: "Nuevo número de personas (opcional)" },
      tableNumber: { type: "string", description: "Mesa o zona (opcional)" },
      notes: { type: "string", description: "Observaciones (opcional)" },
      customerPhone: { type: "string", description: "Teléfono de contacto (opcional)" },
    },
    additionalProperties: false,
  }),
  handler: async (ctx, args) => {
    if (!ctx.threadId) return "Falta el ID del hilo.";

    const hasAny =
      args.date ||
      args.time ||
      args.numberOfPeople !== undefined ||
      args.tableNumber !== undefined ||
      args.notes !== undefined ||
      args.customerPhone !== undefined;
    if (!hasAny) {
      return "Indica qué quieres cambiar (fecha, hora, personas, mesa, notas o teléfono).";
    }

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
      return "No encontré una reserva activa en este chat para modificar. Si la hiciste por otro medio, contacta al restaurante.";
    }

    const durationMs = target.endTime - target.startTime;
    const start = new Date(target.startTime);
    let year = start.getFullYear();
    let month = start.getMonth() + 1;
    let day = start.getDate();
    let hours = start.getHours();
    let minutes = start.getMinutes();

    if (args.date) {
      const parts = args.date.split("-").map(Number);
      if (parts.length === 3) {
        year = parts[0];
        month = parts[1];
        day = parts[2];
      }
    }
    if (args.time) {
      const match = args.time.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
      if (match) {
        hours = parseInt(match[1], 10);
        minutes = match[2] ? parseInt(match[2], 10) : 0;
        if (match[3]?.toLowerCase() === "pm" && hours < 12) hours += 12;
        if (match[3]?.toLowerCase() === "am" && hours === 12) hours = 0;
      }
    }

    const newStart = new Date(year, month - 1, day, hours, minutes, 0);
    const newStartTime = newStart.getTime();
    const newEndTime = newStartTime + durationMs;

    try {
      await ctx.runMutation(api.reservations.update, {
        reservationId: target._id,
        ...(args.date || args.time ? { startTime: newStartTime, endTime: newEndTime } : {}),
        ...(args.numberOfPeople !== undefined ? { numberOfPeople: args.numberOfPeople } : {}),
        ...(args.tableNumber !== undefined ? { tableNumber: args.tableNumber.trim() || undefined } : {}),
        ...(args.notes !== undefined ? { notes: args.notes.trim() || undefined } : {}),
        ...(args.customerPhone !== undefined ? { customerPhone: args.customerPhone.trim() || undefined } : {}),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return `No se pudo actualizar la reserva: ${message}`;
    }

    const d = new Date(newStartTime);
    const summary = [
      `Reserva actualizada.`,
      `Fecha: ${d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}`,
      `Hora: ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      args.numberOfPeople !== undefined ? `Personas: ${args.numberOfPeople}` : null,
      args.tableNumber !== undefined ? `Mesa/Zona: ${args.tableNumber}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const msg = `${summary}\n\nSi necesitas otro cambio, dímelo.`;
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
