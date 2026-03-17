import { internalAction, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

export const list = query({
  args: {
    tenantId: v.id("tenants"),
    status: v.optional(v.string()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pqrs")
      .withIndex("by_tenant_created", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    let filtered = rows;
    if (args.status && args.status !== "all") {
      filtered = filtered.filter((r) => r.status === args.status);
    }
    if (args.type && args.type !== "all") {
      filtered = filtered.filter((r) => r.type === args.type);
    }
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const get = query({
  args: { pqrId: v.id("pqrs") },
  handler: async (ctx, args) => ctx.db.get(args.pqrId),
});

export const create = mutation({
  args: {
    tenantId: v.id("tenants"),
    type: v.union(
      v.literal("petition"),
      v.literal("complaint"),
      v.literal("claim"),
      v.literal("suggestion"),
      v.literal("compliment")
    ),
    customerName: v.optional(v.string()), // Si vacío o anónimo, se guarda "Anónimo"
    customerEmail: v.optional(v.string()),
    customerPhone: v.optional(v.string()),
    subject: v.string(),
    description: v.string(),
    source: v.optional(
      v.union(
        v.literal("whatsapp"),
        v.literal("web"),
        v.literal("presencial"),
        v.literal("email")
      )
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const customerName = (args.customerName?.trim() || "Anónimo");

    // Generar número de ticket legible: año + número secuencial del día
    const date = new Date(now);
    const yy = String(date.getFullYear()).slice(2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const seq = String(now).slice(-4); // últimos 4 dígitos del timestamp
    const ticketNumber = `${yy}${mm}${dd}-${seq}`;

    const id = await ctx.db.insert("pqrs", {
      tenantId: args.tenantId,
      type: args.type,
      customerName,
      customerEmail: args.customerEmail?.trim() || undefined,
      customerPhone: args.customerPhone?.trim() || undefined,
      subject: args.subject.trim(),
      description: args.description.trim(),
      status: "open",
      source: args.source,
      ticketNumber,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.pqrs.sendPqrNotificationEmail, { pqrId: id });
    return id;
  },
});

/** Envía por Brevo la notificación de PQR a los correos configurados del tenant */
export const sendPqrNotificationEmail = internalAction({
  args: { pqrId: v.id("pqrs") },
  handler: async (ctx, args) => {
    const pqr = await ctx.runQuery(api.pqrs.get, { pqrId: args.pqrId });
    if (!pqr) return;
    const tenant = await ctx.runQuery(api.tenants.get, { tenantId: pqr.tenantId });
    if (!tenant) return;
    const emails = tenant.pqrNotificationEmails?.filter((e: string) => e?.trim()) ?? [];
    if (emails.length === 0) return;

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL ?? "noreply@example.com";
    const senderName = process.env.BREVO_SENDER_NAME ?? "Sistema";
    if (!apiKey) {
      console.warn("BREVO_API_KEY no configurada, no se envía email de PQR");
      return;
    }

    const TYPE_LABELS: Record<string, string> = {
      petition: "Petición",
      complaint: "Queja",
      claim: "Reclamo",
      suggestion: "Sugerencia",
      compliment: "Felicitación",
    };
    const typeLabel = TYPE_LABELS[pqr.type] ?? pqr.type;
    const subject = `[PQR] Nueva ${typeLabel} - ${pqr.subject}`;
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; line-height: 1.6; color: #333;">
  <h2>Nueva ${typeLabel} registrada</h2>
  <p><strong>Restaurante:</strong> ${tenant.name ?? "—"}</p>
  <p><strong>Asunto:</strong> ${pqr.subject}</p>
  <p><strong>Descripción:</strong></p>
  <p>${pqr.description.replace(/\n/g, "<br>")}</p>
  <hr>
  <p><strong>Cliente:</strong> ${pqr.customerName}</p>
  ${pqr.customerEmail ? `<p><strong>Email:</strong> ${pqr.customerEmail}</p>` : ""}
  ${pqr.customerPhone ? `<p><strong>Teléfono:</strong> ${pqr.customerPhone}</p>` : ""}
  <p style="color:#666; font-size:12px;">Canal: ${pqr.source ?? "—"} · ${new Date(pqr.createdAt).toLocaleString("es")}</p>
</body>
</html>`;

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: emails.map((e: string) => ({ email: e.trim() })),
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("Brevo PQR email error:", res.status, err);
    }
  },
});

export const update = mutation({
  args: {
    pqrId: v.id("pqrs"),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("in_progress"),
        v.literal("resolved"),
        v.literal("closed")
      )
    ),
    assignedTo: v.optional(v.id("users")),
    resolutionNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { pqrId, ...updates } = args;
    const row = await ctx.db.get(pqrId);
    if (!row) throw new Error("PQR no encontrado");

    const clean: Record<string, unknown> = {};
    if (updates.status !== undefined) {
      clean.status = updates.status;
      if (updates.status === "resolved" || updates.status === "closed") {
        clean.resolvedAt = Date.now();
      }
    }
    if (updates.assignedTo !== undefined) clean.assignedTo = updates.assignedTo;
    if (updates.resolutionNotes !== undefined) clean.resolutionNotes = updates.resolutionNotes;
    clean.updatedAt = Date.now();
    await ctx.db.patch(pqrId, clean);
    return pqrId;
  },
});

export const remove = mutation({
  args: { pqrId: v.id("pqrs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pqrId);
    if (!row) throw new Error("PQR no encontrado");
    await ctx.db.delete(args.pqrId);
    return args.pqrId;
  },
});
