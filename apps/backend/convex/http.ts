import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Webhook que recibe YCloud (WhatsApp, etc.) por tenant.
 * URL: POST https://<tu-backend>.convex.site/webhooks/ycloud/<tenantId>
 *
 * Soporta el payload real de YCloud (whatsapp.inbound_message.received):
 * - whatsappInboundMessage.from → contactId
 * - whatsappInboundMessage.customerProfile.name → nombre del cliente
 * - whatsappInboundMessage.text.body / image.caption / etc. → contenido
 *
 * También acepta formato simplificado para testing:
 * { contactId, customerName, channel, text }
 */
const webhookYCloud = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // pathPrefix /webhooks/ycloud/ → pathParts = ["webhooks", "ycloud", "<tenantId>"]
  const tenantId = pathParts[2] as Id<"tenants"> | undefined;
  if (!tenantId || tenantId === "ycloud") {
    return new Response(JSON.stringify({ error: "tenantId required in path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const tenant = await ctx.runQuery(api.tenants.get, { tenantId });
  if (!tenant) {
    return new Response(JSON.stringify({ error: "Tenant not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Solo procesar mensajes entrantes de WhatsApp; ignorar otros eventos
  const eventType = (body as { type?: string })?.type;
  if (
    eventType &&
    eventType !== "whatsapp.inbound_message.received"
  ) {
    return new Response(
      JSON.stringify({ ok: true, skipped: "event type not processed" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // Payload real de YCloud (whatsapp.inbound_message.received)
  const wim = (body as { whatsappInboundMessage?: unknown })
    ?.whatsappInboundMessage as
    | {
        from?: string;
        customerProfile?: { name?: string };
        type?: string;
        text?: { body?: string };
        image?: { link?: string; caption?: string };
        video?: { link?: string; caption?: string };
        audio?: { link?: string };
        document?: { link?: string; filename?: string; caption?: string };
        sticker?: { link?: string };
        location?: unknown;
      }
    | undefined;

  let contactId: string;
  let customerName: string;
  let channel: "whatsapp" | "messenger" | "webchat";
  let text: string;
  let mediaUrl: string | undefined;
  let mediaType: "image" | "video" | "audio" | "document" | undefined;

  if (wim) {
    const from = (wim.from ?? "").trim();
    if (!from) {
      return new Response(
        JSON.stringify({ error: "Missing from in whatsappInboundMessage" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    contactId = from.startsWith("whatsapp:")
      ? from
      : `whatsapp:${from.startsWith("+") ? from : `+${from}`}`;
    customerName =
      wim.customerProfile?.name?.trim() ||
      from.replace(/^whatsapp:/, "").replace(/^\+/, "") ||
      "Cliente";
    channel = "whatsapp";
    if (wim.type === "text" && wim.text?.body) {
      text = wim.text.body;
    } else if (wim.type === "image") {
      mediaUrl = wim.image?.link;
      mediaType = "image";
      text = wim.image?.caption?.trim() ? wim.image.caption : "Imagen";
    } else if (wim.type === "video") {
      mediaUrl = wim.video?.link;
      mediaType = "video";
      text = wim.video?.caption?.trim() ? wim.video.caption : "Video";
    } else if (wim.type === "audio") {
      mediaUrl = wim.audio?.link;
      mediaType = "audio";
      text = "Audio";
    } else if (wim.type === "document") {
      mediaUrl = wim.document?.link;
      mediaType = "document";
      text = wim.document?.caption?.trim() || wim.document?.filename || "Documento";
    } else if (wim.type === "sticker") {
      mediaUrl = wim.sticker?.link;
      mediaType = "image"; // stickers son webp
      text = "Sticker";
    } else if (wim.type === "location") {
      text = "[Ubicación]";
    } else {
      text = wim.type ? `[${wim.type}]` : "";
    }
  } else {
    mediaUrl = undefined;
    mediaType = undefined;
    // Formato simplificado (testing / compatibilidad)
    const simple = body as {
      contactId?: string;
      customerName?: string;
      channel?: "whatsapp" | "messenger" | "webchat";
      text?: string;
    };
    const rawContact = simple.contactId ?? "";
    contactId = rawContact.startsWith("whatsapp:")
      ? rawContact
      : rawContact
        ? `whatsapp:${rawContact.startsWith("+") ? rawContact : `+${rawContact}`}`
        : "unknown";
    customerName = simple.customerName?.trim() ?? "Cliente";
    channel = simple.channel ?? "whatsapp";
    text = simple.text ?? "";
  }

  // Rechazar si no hay contactId válido (evita duplicados "Cliente" / "unknown")
  if (
    !contactId ||
    contactId === "unknown" ||
    contactId === "whatsapp:+unknown" ||
    contactId.includes("unknown")
  ) {
    return new Response(
      JSON.stringify({ error: "Invalid or missing contactId/from" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  await ctx.runMutation(api.integrations.markYCloudConnected, { tenantId });

  const eventId =
    (body as { id?: string })?.id ?? `evt_${Date.now()}_${contactId}`;

  // Programar procesamiento en segundo plano; respondemos 200 de inmediato para evitar
  // que YCloud desconecte por timeout (la IA puede tardar 15-60 segundos)
  await ctx.runMutation(api.ycloud.scheduleInboundProcessing, {
    tenantId,
    eventId,
    contactId,
    customerName,
    channel,
    text,
    mediaUrl,
    mediaType,
  });

  return new Response(JSON.stringify({ ok: true, received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * Proxy para servir archivos de storage con Content-Type correcto.
 * YCloud/WhatsApp rechazan audio si Convex sirve application/octet-stream.
 * GET /media/proxy?storageId=xxx&contentType=audio/mp4
 */
const mediaProxy = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(request.url);
  const storageId = url.searchParams.get("storageId") as Id<"_storage"> | null;
  const contentType = url.searchParams.get("contentType") || "application/octet-stream";
  if (!storageId) {
    return new Response("storageId required", { status: 400 });
  }
  const directUrl = await ctx.storage.getUrl(storageId);
  if (!directUrl) {
    return new Response("File not found", { status: 404 });
  }
  const res = await fetch(directUrl);
  if (!res.ok) {
    return new Response("Upstream error", { status: 502 });
  }
  const blob = await res.blob();
  const safeContentType = /^[a-z]+\/[a-z0-9.+-]+(;\s*[a-z]+=[a-z0-9]+)?$/i.test(contentType)
    ? contentType
    : "application/octet-stream";
  return new Response(blob, {
    headers: { "Content-Type": safeContentType },
  });
});

/**
 * Callback OAuth de Google Calendar. Recibe ?code=xxx&state=tenantId y guarda tokens.
 * GET /auth/google/calendar/callback?code=xxx&state=tenantId
 */
const googleCalendarCallback = httpAction(async (ctx, request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tenantId = url.searchParams.get("state") as Id<"tenants"> | null;
  const error = url.searchParams.get("error");

  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const redirectSuccess = `${baseUrl}/tenants/reservas?google=connected`;
  const redirectError = `${baseUrl}/tenants/reservas?google=error`;

  if (error || !code || !tenantId) {
    console.error("Google Calendar callback: missing params", { error: !!error, hasCode: !!code, hasTenantId: !!tenantId });
    return Response.redirect(redirectError);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Google Calendar callback: GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET no configurados en Convex (Settings → Environment Variables)");
    return Response.redirect(redirectError);
  }

  const redirectUri = new URL("/auth/google/calendar/callback", request.url).href;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("Google Calendar token exchange failed", tokenRes.status, errText);
    return Response.redirect(redirectError);
  }

  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokens.access_token) {
    console.error("Google Calendar: no access_token in response", JSON.stringify(tokens));
    return Response.redirect(redirectError);
  }

  await ctx.runMutation(internal.googleCalendar.saveTokens, {
    tenantId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : undefined,
  });

  return Response.redirect(redirectSuccess);
});

const http = httpRouter();

http.route({
  path: "/media/proxy",
  method: "GET",
  handler: mediaProxy,
});

http.route({
  path: "/auth/google/calendar/callback",
  method: "GET",
  handler: googleCalendarCallback,
});

http.route({
  pathPrefix: "/webhooks/ycloud/",
  method: "POST",
  handler: webhookYCloud,
});

export default http;
