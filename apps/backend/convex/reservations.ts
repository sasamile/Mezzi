import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const listByDateRange = query({
  args: {
    tenantId: v.id("tenants"),
    startTime: v.number(),
    endTime: v.number(),
    includeCancelled: v.optional(v.boolean()), // true = incluir canceladas (para tabs)
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reservations")
      .withIndex("by_tenant_date", (q) =>
        q.eq("tenantId", args.tenantId).gte("startTime", args.startTime).lte("startTime", args.endTime)
      )
      .collect();
    if (args.includeCancelled) return rows;
    return rows.filter((r) => r.status !== "cancelled");
  },
});

export const listByDay = query({
  args: {
    tenantId: v.id("tenants"),
    dayStart: v.number(), // inicio del día (00:00 local)
  },
  handler: async (ctx, args) => {
    const dayEnd = args.dayStart + 24 * 60 * 60 * 1000;
    return ctx.db
      .query("reservations")
      .withIndex("by_tenant_date", (q) =>
        q.eq("tenantId", args.tenantId).gte("startTime", args.dayStart).lt("startTime", dayEnd)
      )
      .collect();
  },
});

/** Crear reserva desde importación Google (sin sync a Calendar) */
export const createFromImport = mutation({
  args: {
    tenantId: v.id("tenants"),
    startTime: v.number(),
    endTime: v.number(),
    customerName: v.string(),
    tableNumber: v.optional(v.string()),
    googleEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("reservations", {
      tenantId: args.tenantId,
      startTime: args.startTime,
      endTime: args.endTime,
      customerName: args.customerName,
      tableNumber: args.tableNumber,
      source: "presencial",
      status: "confirmed",
      googleEventId: args.googleEventId,
      importedFromGoogle: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Comprueba si ya existe una reserva activa para la misma mesa en el rango [startTime, endTime). Excluye reservationIdToExclude (para edición). */
async function hasOverlappingTableReservation(
  ctx: MutationCtx,
  tenantId: Id<"tenants">,
  startTime: number,
  endTime: number,
  tableNumber: string | undefined,
  reservationIdToExclude?: Id<"reservations">
): Promise<boolean> {
  if (!tableNumber || !tableNumber.trim()) return false;
  const table = (tableNumber ?? "").trim().toLowerCase();
  const windowStart = startTime - 7 * 24 * 60 * 60 * 1000;
  const rows = await ctx.db
    .query("reservations")
    .withIndex("by_tenant_date", (q) =>
      q.eq("tenantId", tenantId).gte("startTime", windowStart).lte("startTime", endTime)
    )
    .collect();
  const active = rows.filter(
    (r) =>
      r.status !== "cancelled" &&
      r.status !== "no_show" &&
      r._id !== reservationIdToExclude &&
      (r.tableNumber ?? "").trim().toLowerCase() === table &&
      r.startTime < endTime &&
      r.endTime > startTime
  );
  return active.length > 0;
}

export const create = mutation({
  args: {
    tenantId: v.id("tenants"),
    startTime: v.number(),
    endTime: v.number(),
    customerName: v.string(),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    tableNumber: v.optional(v.string()),
    numberOfPeople: v.optional(v.number()),
    notes: v.optional(v.string()),
    source: v.union(v.literal("virtual"), v.literal("presencial")),
    conversationId: v.optional(v.id("conversations")),
    extraData: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const overlap = await hasOverlappingTableReservation(ctx, args.tenantId, args.startTime, args.endTime, args.tableNumber);
    if (overlap) {
      throw new Error("Esta mesa ya tiene una reserva en ese horario. Elige otra mesa o otro rango de horas.");
    }
    const now = Date.now();
    const reservationId = await ctx.db.insert("reservations", {
      tenantId: args.tenantId,
      startTime: args.startTime,
      endTime: args.endTime,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      customerPhone: args.customerPhone,
      tableNumber: args.tableNumber,
      numberOfPeople: args.numberOfPeople,
      notes: args.notes,
      source: args.source,
      conversationId: args.conversationId,
      extraData: args.extraData,
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    });
    const peopleStr = args.numberOfPeople ? ` · ${args.numberOfPeople} personas` : "";
    await ctx.runMutation(api.activityLog.log, {
      tenantId: args.tenantId,
      type: "reservation_created",
      message: `Nueva reserva: ${args.customerName}${args.tableNumber ? ` - Mesa ${args.tableNumber}` : ""}${peopleStr}`,
      reservationId,
      tableNumber: args.tableNumber,
      customerName: args.customerName,
    });
    await ctx.scheduler.runAfter(0, internal.system.googleCalendarSync.syncReservationToCalendar, {
      tenantId: args.tenantId,
      reservationId,
    });
    return reservationId;
  },
});

export const update = mutation({
  args: {
    reservationId: v.id("reservations"),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    customerName: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    tableNumber: v.optional(v.string()),
    numberOfPeople: v.optional(v.number()),
    notes: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("confirmed"),
        v.literal("pending"),
        v.literal("cancelled"),
        v.literal("completed"),
        v.literal("no_show")
      )
    ),
    confirmedAt: v.optional(v.number()),
    noShowAt: v.optional(v.number()),
    googleEventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { reservationId, ...updates } = args;
    const row = await ctx.db.get(reservationId);
    if (!row) throw new Error("Reserva no encontrada");

    const newStart = updates.startTime ?? row.startTime;
    const newEnd = updates.endTime ?? row.endTime;
    const newTable = updates.tableNumber !== undefined ? updates.tableNumber : row.tableNumber;
    const overlap = await hasOverlappingTableReservation(ctx, row.tenantId, newStart, newEnd, newTable ?? undefined, reservationId);
    if (overlap) {
      throw new Error("Esta mesa ya tiene una reserva en ese horario. Elige otra mesa o otro rango de horas.");
    }

    const clean: Record<string, unknown> = {};
    if (updates.startTime !== undefined) clean.startTime = updates.startTime;
    if (updates.endTime !== undefined) clean.endTime = updates.endTime;
    if (updates.customerName !== undefined) clean.customerName = updates.customerName;
    if (updates.customerEmail !== undefined) clean.customerEmail = updates.customerEmail;
    if (updates.customerPhone !== undefined) clean.customerPhone = updates.customerPhone;
    if (updates.tableNumber !== undefined) clean.tableNumber = updates.tableNumber;
    if (updates.numberOfPeople !== undefined) clean.numberOfPeople = updates.numberOfPeople;
    if (updates.notes !== undefined) clean.notes = updates.notes;
    if (updates.status !== undefined) clean.status = updates.status;
    if (updates.confirmedAt !== undefined) clean.confirmedAt = updates.confirmedAt;
    if (updates.noShowAt !== undefined) clean.noShowAt = updates.noShowAt;
    if (updates.googleEventId !== undefined) clean.googleEventId = updates.googleEventId;
    clean.updatedAt = Date.now();
    await ctx.db.patch(reservationId, clean);
    const calendarRelevant =
      updates.startTime !== undefined ||
      updates.endTime !== undefined ||
      updates.customerName !== undefined ||
      updates.customerPhone !== undefined ||
      updates.customerEmail !== undefined ||
      updates.numberOfPeople !== undefined ||
      updates.tableNumber !== undefined ||
      updates.notes !== undefined;
    if (calendarRelevant && row.status !== "cancelled") {
      await ctx.scheduler.runAfter(0, internal.system.googleCalendarSync.syncReservationToCalendar, {
        tenantId: row.tenantId,
        reservationId,
      });
    }
    return reservationId;
  },
});

/** Reservas activas de esta conversación (WhatsApp), más recientes primero. */
export const listActiveByConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("reservations")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    const active = rows.filter((r) => r.status === "confirmed" || r.status === "pending");
    return active.sort((a, b) => b.startTime - a.startTime);
  },
});

export const cancel = mutation({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reservationId);
    if (!row) throw new Error("Reserva no encontrada");
    if (row.googleEventId) {
      await ctx.scheduler.runAfter(0, internal.system.googleCalendarSync.deleteEventFromCalendar, {
        tenantId: row.tenantId,
        googleEventId: row.googleEventId,
      });
    }
    await ctx.db.patch(args.reservationId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });
    return args.reservationId;
  },
});

export const confirmArrival = mutation({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reservationId);
    if (!row) throw new Error("Reserva no encontrada");
    const now = Date.now();
    await ctx.db.patch(args.reservationId, {
      confirmedAt: now,
      status: "confirmed",
      updatedAt: now,
    });
    await ctx.runMutation(api.activityLog.log, {
      tenantId: row.tenantId,
      type: "arrival_confirmed",
      message: `${row.customerName} confirmó llegada`,
      reservationId: args.reservationId,
      tableNumber: row.tableNumber,
      customerName: row.customerName,
    });
    return args.reservationId;
  },
});

export const markNoShow = mutation({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reservationId);
    if (!row) throw new Error("Reserva no encontrada");
    const now = Date.now();
    await ctx.db.patch(args.reservationId, {
      status: "no_show",
      noShowAt: now,
      updatedAt: now,
    });
    await ctx.runMutation(api.activityLog.log, {
      tenantId: row.tenantId,
      type: "no_show",
      message: `Cliente no se presentó - Mesa ${row.tableNumber ?? "?"}`,
      reservationId: args.reservationId,
      tableNumber: row.tableNumber,
      customerName: row.customerName,
    });
    return args.reservationId;
  },
});

export const freeTable = mutation({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reservationId);
    if (!row) throw new Error("Reserva no encontrada");
    const now = Date.now();
    await ctx.db.patch(args.reservationId, {
      status: "completed",
      endTime: Math.max(row.endTime, now),
      updatedAt: now,
    });
    await ctx.runMutation(api.activityLog.log, {
      tenantId: row.tenantId,
      type: "table_freed",
      message: `Mesa ${row.tableNumber ?? "?"} liberada`,
      reservationId: args.reservationId,
      tableNumber: row.tableNumber,
    });
    return args.reservationId;
  },
});

export const get = query({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => ctx.db.get(args.reservationId),
});

export const deleteReservation = mutation({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reservationId);
    if (!row) throw new Error("Reserva no encontrada");

    if (row.googleEventId) {
      await ctx.scheduler.runAfter(0, internal.system.googleCalendarSync.deleteEventFromCalendar, {
        tenantId: row.tenantId,
        googleEventId: row.googleEventId,
      });
    }

    await ctx.db.delete(args.reservationId);
    return args.reservationId;
  },
});
