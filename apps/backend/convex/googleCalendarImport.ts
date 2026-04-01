import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

async function refreshGoogleToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
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

/**
 * Importa eventos de Google Calendar a reservas.
 */
export const importFromGoogle = action({
  args: {
    tenantId: v.id("tenants"),
    timeMin: v.number(),
    timeMax: v.number(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ imported: number; error?: string }> => {
    const gc = await ctx.runQuery(internal.googleCalendar.getForSync, {
      tenantId: args.tenantId,
    });
    if (!gc?.connected || !gc.accessToken) {
      return { imported: 0, error: "Google Calendar no conectado" };
    }

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
    const timeMinIso = new Date(args.timeMin).toISOString();
    const timeMaxIso = new Date(args.timeMax).toISOString();

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
        new URLSearchParams({
          timeMin: timeMinIso,
          timeMax: timeMaxIso,
          singleEvents: "true",
          orderBy: "startTime",
        }),
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ) as Response;
    if (!res.ok) {
      const err = await res.text();
      return { imported: 0, error: `Google API ${res.status}: ${err.slice(0, 200)}` };
    }

    const data = (await res.json()) as {
      items?: Array<{
        id?: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };
    const items = data.items ?? [];
    let imported = 0;
    const existingIds = await ctx.runQuery(api.reservations.listByDateRange, {
      tenantId: args.tenantId,
      startTime: args.timeMin,
      endTime: args.timeMax,
    });
    const existingGoogleIds = new Set<string>(
      existingIds.filter((r) => !!r.googleEventId).map((r) => r.googleEventId as string)
    );

    for (const ev of items) {
      if (!ev.id || existingGoogleIds.has(ev.id)) continue;
      const start = ev.start?.dateTime || ev.start?.date;
      const end = ev.end?.dateTime || ev.end?.date;
      if (!start || !end) continue;
      const startTime = new Date(start).getTime();
      const endTime = new Date(end).getTime();
      const nameMatch = (ev.summary ?? "Cliente").match(/Reserva:?\s*(.+?)(?:\s*-\s*Mesa|$)/i);
      const customerName = nameMatch ? nameMatch[1].trim() : (ev.summary ?? "Cliente");
      const tableMatch = (ev.summary ?? "").match(/Mesa\s*(\d+|\w+)/i);
      const tableNumber = tableMatch ? tableMatch[1] : undefined;

      await ctx.runMutation(api.reservations.createFromImport, {
        tenantId: args.tenantId,
        startTime,
        endTime,
        customerName,
        tableNumber,
        googleEventId: ev.id,
      });
      imported++;
      existingGoogleIds.add(ev.id);
    }
    return { imported };
  },
});
