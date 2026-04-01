import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";

/**
 * Sincroniza una reserva a Google Calendar si está conectado.
 * Usa fetch para llamar a la API de Google Calendar.
 */
export const syncReservationToCalendar = internalAction({
  args: {
    tenantId: v.id("tenants"),
    reservationId: v.id("reservations"),
  },
  handler: async (ctx, args) => {
    const reservation = await ctx.runQuery(api.reservations.get, {
      reservationId: args.reservationId,
    });
    if (!reservation || reservation.status === "cancelled") return;

    const gc = await ctx.runQuery(internal.googleCalendar.getForSync, {
      tenantId: args.tenantId,
    });
    if (!gc?.connected || !gc.accessToken) return;

    let accessToken = gc.accessToken;
    if (gc.expiresAt && gc.expiresAt < Date.now() + 60 * 1000 && gc.refreshToken) {
      const refreshed = await refreshGoogleToken(gc.refreshToken);
      if (refreshed) {
        accessToken = refreshed.access_token;
        await ctx.runMutation(api.googleCalendar.saveTokens, {
          tenantId: args.tenantId,
          accessToken: refreshed.access_token,
          expiresAt: Date.now() + refreshed.expires_in * 1000,
        });
      }
    }

    const calendarId = gc.calendarId ?? "primary";
    const timezone = "America/Bogota";
    const peopleStr = reservation.numberOfPeople ? ` · ${reservation.numberOfPeople} pax` : "";
    const summary = `Reserva: ${reservation.customerName}${reservation.tableNumber ? ` - ${reservation.tableNumber}` : ""}${peopleStr}`;
    const description = [
      `Cliente: ${reservation.customerName}`,
      reservation.customerPhone ? `Tel: ${reservation.customerPhone}` : null,
      reservation.customerEmail ? `Email: ${reservation.customerEmail}` : null,
      reservation.numberOfPeople ? `Personas: ${reservation.numberOfPeople}` : null,
      reservation.tableNumber ? `Mesa/Zona: ${reservation.tableNumber}` : null,
      reservation.notes ? `Notas: ${reservation.notes}` : null,
      `Origen: ${reservation.source === "virtual" ? "WhatsApp/Chat" : "Presencial"}`,
    ]
      .filter(Boolean)
      .join("\n");

    const startDateTime = new Date(reservation.startTime).toISOString();
    const endDateTime = new Date(reservation.endTime).toISOString();

    const eventBody = JSON.stringify({
      summary,
      description,
      start: { dateTime: startDateTime, timeZone: timezone },
      end: { dateTime: endDateTime, timeZone: timezone },
    });

    const existingId = reservation.googleEventId;
    const url = existingId
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingId)}`
      : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

    const res = await fetch(url, {
      method: existingId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: eventBody,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Google Calendar sync error:", res.status, err);
      return;
    }

    const event = (await res.json()) as { id?: string };
    if (!existingId && event?.id) {
      await ctx.runMutation(api.reservations.update, {
        reservationId: args.reservationId,
        googleEventId: event.id,
      });
    }
  },
});

/**
 * Elimina un evento de Google Calendar cuando se borra una reserva.
 */
export const deleteEventFromCalendar = internalAction({
  args: {
    tenantId: v.id("tenants"),
    googleEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const gc = await ctx.runQuery(internal.googleCalendar.getForSync, {
      tenantId: args.tenantId,
    });
    if (!gc?.connected || !gc.accessToken) return;

    let accessToken = gc.accessToken;
    if (gc.expiresAt && gc.expiresAt < Date.now() + 60 * 1000 && gc.refreshToken) {
      const refreshed = await refreshGoogleToken(gc.refreshToken);
      if (refreshed) {
        accessToken = refreshed.access_token;
        await ctx.runMutation(api.googleCalendar.saveTokens, {
          tenantId: args.tenantId,
          accessToken: refreshed.access_token,
          expiresAt: Date.now() + refreshed.expires_in * 1000,
        });
      }
    }

    const calendarId = gc.calendarId ?? "primary";
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(args.googleEventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      console.error("Google Calendar delete event error:", res.status, await res.text());
    }
  },
});

async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) return null;
  return res.json();
}
