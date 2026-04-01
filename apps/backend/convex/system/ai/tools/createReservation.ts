import { createTool } from "@convex-dev/agent";
import { jsonSchema } from "ai";
import { api, internal } from "../../../_generated/api";
import type { Doc } from "../../../_generated/dataModel";

/**
 * Crea una reserva en el restaurante. Se usa cuando el cliente ya proporcionó
 * todos los datos necesarios (nombre, teléfono, fecha/hora, mesa, etc.).
 */
export const createReservation = createTool({
  description:
    "Crear una reserva. Úsala en cuanto tengas nombre, teléfono, fecha (YYYY-MM-DD; si el cliente dijo 'hoy' usa la fecha actual del contexto), hora en 24h (ej. 16:31, 19:00) y número de personas. Opcional: tableNumber (ej. 'Party 1', 'Mesa 4', 'Rooftop'), notes (cumpleaños, aniversario, decoración, etc.).",
  args: jsonSchema<{
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    date: string;
    time: string;
    numberOfPeople: number;
    tableNumber?: string;
    notes?: string;
    durationMinutes?: number;
  }>({
    type: "object",
    properties: {
      customerName: { type: "string", description: "Nombre del cliente" },
      customerPhone: { type: "string", description: "Teléfono del cliente" },
      customerEmail: { type: "string", description: "Email del cliente (opcional)" },
      date: { type: "string", description: "Fecha YYYY-MM-DD (para 'hoy' usa la fecha actual indicada en el contexto)" },
      time: { type: "string", description: "Hora en 24h, ej. 16:31 o 19:00" },
      numberOfPeople: { type: "number", description: "Número de personas en la reserva" },
      tableNumber: { type: "string", description: "Mesa o zona preferida (opcional), ej. 'Party 1', 'Mesa 4', 'Rooftop'" },
      notes: { type: "string", description: "Observaciones opcionales: cumpleaños, aniversario, decoración, solicitudes especiales" },
      durationMinutes: { type: "number", description: "Duración en minutos (opcional, default 120)" },
    },
    required: ["customerName", "date", "time", "numberOfPeople"],
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
    if (tenant?.enabledModules?.reservas === false) {
      return "Este restaurante no tiene habilitado el módulo de reservas. No puedo crear reservas por este canal. Por favor contacta directamente al restaurante.";
    }

    const tenantId = conversation.tenantId;
    const conversationId = conversation._id;

    // Obtener config para validar límites
    const config = (await ctx.runQuery(api.reservationConfig.getOrDefault, {
      tenantId,
    })) as {
      maxReservationsPerDay: number;
      maxVirtualPerDay?: number;
      defaultDurationMinutes?: number;
    };
    const durationMin = args.durationMinutes ?? config.defaultDurationMinutes ?? 120;

    // Parsear fecha y hora
    const [year, month, day] = args.date.split("-").map(Number);
    const timeMatch = args.time.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
    let hours = 19;
    let minutes = 0;
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      if (timeMatch[3]?.toLowerCase() === "pm" && hours < 12) hours += 12;
      if (timeMatch[3]?.toLowerCase() === "am" && hours === 12) hours = 0;
    }
    const startDate = new Date(year, month - 1, day, hours, minutes, 0);
    const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    const dayStart = new Date(year, month - 1, day, 0, 0, 0).getTime();
    const existingToday = await ctx.runQuery(api.reservations.listByDay, {
      tenantId,
      dayStart,
    });
    const virtualToday = existingToday.filter(
      (r: Doc<"reservations">) => r.source === "virtual" && r.status !== "cancelled"
    );
    const totalToday = existingToday.filter(
      (r: Doc<"reservations">) => r.status !== "cancelled"
    ).length;

    if (totalToday >= (config.maxReservationsPerDay ?? 999)) {
      return `Lo sentimos, ya alcanzamos el límite de ${config.maxReservationsPerDay} reservas para ese día. ¿Quieres probar otra fecha?`;
    }
    const maxVirtual = config.maxVirtualPerDay ?? 999;
    if (virtualToday.length >= maxVirtual) {
      return `Lo sentimos, el cupo de reservas por WhatsApp para ese día está completo (${maxVirtual}). Te sugiero llamar al restaurante para reservar en persona.`;
    }

    console.log("createReservationTool: intentando crear reserva", {
      tenantId,
      customerName: args.customerName,
      customerPhone: args.customerPhone,
      date: args.date,
      time: args.time,
      numberOfPeople: args.numberOfPeople,
      startTime,
    });

    try {
      await ctx.runMutation(api.reservations.create, {
        tenantId,
        startTime,
        endTime,
        customerName: args.customerName.trim(),
        customerPhone: args.customerPhone?.trim() || undefined,
        customerEmail: args.customerEmail?.trim(),
        tableNumber: args.tableNumber?.trim(),
        numberOfPeople: args.numberOfPeople,
        notes: args.notes?.trim(),
        source: "virtual",
        conversationId,
      });
      console.log("createReservationTool: reserva creada OK", { tenantId, startTime });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("createReservationTool: ERROR al crear reserva", { tenantId, startTime, message });
      // Prefijo especial: ycloud.ts lo detecta para NO enviar directText del LLM
      return `RESERVA_ERROR: La reserva NO fue guardada en el sistema. Error: ${message}. IMPORTANTE: NO envíes el mensaje de confirmación al cliente. Dile que hubo un problema técnico y que vuelva a intentarlo.`;
    }

    // Sincronización con Google Calendar se programa en reservations.create
    const formattedDate = startDate.toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const formattedTime = `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`;

    let msg = `RESERVA_OK: Reserva creada exitosamente.`;
    msg += ` Nombre: ${args.customerName.trim()}.`;
    msg += ` Fecha: ${args.date} (${formattedDate}).`;
    msg += ` Hora: ${formattedTime}.`;
    msg += ` Personas: ${args.numberOfPeople}.`;
    if (args.tableNumber) msg += ` Mesa/Zona: ${args.tableNumber}.`;
    if (args.notes) msg += ` Observaciones: ${args.notes}.`;
    msg += " Ahora envía al cliente el mensaje de confirmación con todos estos datos.";
    return msg;
  },
});
