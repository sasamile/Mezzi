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
    /** Ciudad del cliente — se usa en routing de "Trabaja con Nosotros" */
    customerCity: v.optional(v.string()),
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
    /**
     * Módulo o intención detectada por el bot.
     * Valores posibles (convenio con el bot):
     *   "calidad_alimentos" | "limpieza" | "facturacion" | "domicilios"
     *   "sugerencias" | "infraestructura" | "trabaja_nosotros" | "proveedores"
     */
    module: v.optional(v.string()),
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
      customerCity: args.customerCity?.trim() || undefined,
      subject: args.subject.trim(),
      description: args.description.trim(),
      status: "open",
      source: args.source,
      module: args.module?.trim() || undefined,
      ticketNumber,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.pqrs.sendPqrNotificationEmail, { pqrId: id });
    return id;
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normaliza un string para comparación: sin tildes, minúsculas, sin espacios extra */
function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Dado el tenant y la PQR, devuelve { to, cc } resueltos.
 *
 * Lógica:
 * 1. Si el tenant tiene pqrEmailRouting Y la PQR tiene module → busca la primera
 *    regla cuyo module coincida (exacto, normalizado) y, si tiene cityMatch, que el
 *    customerCity de la PQR incluya ese substring (normalizado).
 * 2. Si no hay match en el routing → cae en pqrNotificationEmails (comportamiento anterior).
 * 3. Si tampoco hay pqrNotificationEmails → no se envía nada.
 */
function resolveRecipients(
  tenant: { pqrEmailRouting?: Array<{ module: string; cityMatch?: string; to: string[]; cc?: string[] }>; pqrNotificationEmails?: string[] },
  pqr: { module?: string; customerCity?: string }
): { to: string[]; cc: string[] } | null {
  const routing = tenant.pqrEmailRouting ?? [];

  if (routing.length > 0 && pqr.module) {
    const pqrModule = normalize(pqr.module);
    const pqrCity = pqr.customerCity ? normalize(pqr.customerCity) : "";

    for (const rule of routing) {
      if (normalize(rule.module) !== pqrModule) continue;
      // Si la regla tiene cityMatch, el city del cliente debe incluirlo
      if (rule.cityMatch && !pqrCity.includes(normalize(rule.cityMatch))) continue;
      // ¡Match! — usar esta regla
      return {
        to: rule.to.map((e) => e.trim()).filter(Boolean),
        cc: (rule.cc ?? []).map((e) => e.trim()).filter(Boolean),
      };
    }
    // Ninguna regla coincidió con el módulo → log y fallback
    console.info(
      `PQR routing: módulo "${pqr.module}" no tiene regla para tenant ${tenant}, usando fallback`
    );
  }

  // Fallback: lista global de correos del tenant
  const fallback = (tenant.pqrNotificationEmails ?? []).map((e) => e.trim()).filter(Boolean);
  if (fallback.length === 0) return null;
  return { to: fallback, cc: [] };
}

// ─── Email action ────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  calidad_alimentos: "Calidad de Alimentos y Bebidas",
  limpieza: "Limpieza e Higiene",
  facturacion: "Facturación y Pagos",
  domicilios: "Domicilios",
  sugerencias: "Sugerencias y Felicitaciones",
  infraestructura: "Infraestructura",
  trabaja_nosotros: "Trabaja con Nosotros",
  proveedores: "PQRS Proveedores",
};

const TYPE_LABELS: Record<string, string> = {
  petition: "Petición",
  complaint: "Queja",
  claim: "Reclamo",
  suggestion: "Sugerencia",
  compliment: "Felicitación",
};

/** Envía por Brevo la notificación de PQR al correo que corresponde según el módulo */
export const sendPqrNotificationEmail = internalAction({
  args: { pqrId: v.id("pqrs") },
  handler: async (ctx, args) => {
    const pqr = await ctx.runQuery(api.pqrs.get, { pqrId: args.pqrId });
    if (!pqr) return;
    const tenant = await ctx.runQuery(api.tenants.get, { tenantId: pqr.tenantId });
    if (!tenant) return;

    const recipients = resolveRecipients(tenant, pqr);
    if (!recipients || recipients.to.length === 0) {
      console.info("PQR email: sin destinatarios configurados para tenant", tenant.name);
      return;
    }

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL ?? "noreply@example.com";
    const senderName = process.env.BREVO_SENDER_NAME ?? tenant.name ?? "Sistema";
    if (!apiKey) {
      console.warn("BREVO_API_KEY no configurada, no se envía email de PQR");
      return;
    }

    const typeLabel = TYPE_LABELS[pqr.type] ?? pqr.type;
    const moduleLabel = pqr.module ? (MODULE_LABELS[pqr.module] ?? pqr.module) : null;
    const emailSubject = moduleLabel
      ? `[${moduleLabel}] Nueva ${typeLabel} - ${pqr.subject}`
      : `[PQR] Nueva ${typeLabel} - ${pqr.subject}`;

    const html = `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 24px;">
  <div style="background: #f8fafc; border-radius: 12px; padding: 24px 28px; margin-bottom: 20px;">
    <h2 style="margin: 0 0 4px; font-size: 20px; color: #0f172a;">Nueva ${typeLabel}</h2>
    ${moduleLabel ? `<p style="margin: 0; font-size: 14px; color: #64748b;">Módulo: <strong>${moduleLabel}</strong></p>` : ""}
  </div>

  <table style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 8px 0; color: #64748b; font-size: 13px; width: 120px;">Restaurante</td>
      <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${tenant.name ?? "—"}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Ticket</td>
      <td style="padding: 8px 0; font-size: 14px; font-family: monospace;">${pqr.ticketNumber ?? "—"}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Asunto</td>
      <td style="padding: 8px 0; font-size: 14px;">${pqr.subject}</td>
    </tr>
    <tr>
      <td style="padding: 8px 0; color: #64748b; font-size: 13px; vertical-align: top;">Descripción</td>
      <td style="padding: 8px 0; font-size: 14px;">${pqr.description.replace(/\n/g, "<br>")}</td>
    </tr>
  </table>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">

  <p style="font-size: 13px; color: #475569; margin: 0 0 4px;"><strong>Datos del cliente</strong></p>
  <table style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 6px 0; color: #64748b; font-size: 13px; width: 120px;">Nombre</td>
      <td style="padding: 6px 0; font-size: 14px;">${pqr.customerName}</td>
    </tr>
    ${pqr.customerEmail ? `<tr><td style="padding: 6px 0; color: #64748b; font-size: 13px;">Email</td><td style="padding: 6px 0; font-size: 14px;">${pqr.customerEmail}</td></tr>` : ""}
    ${pqr.customerPhone ? `<tr><td style="padding: 6px 0; color: #64748b; font-size: 13px;">Teléfono</td><td style="padding: 6px 0; font-size: 14px;">${pqr.customerPhone}</td></tr>` : ""}
    ${pqr.customerCity ? `<tr><td style="padding: 6px 0; color: #64748b; font-size: 13px;">Ciudad</td><td style="padding: 6px 0; font-size: 14px;">${pqr.customerCity}</td></tr>` : ""}
  </table>

  <p style="margin-top: 20px; font-size: 11px; color: #94a3b8;">
    Canal: ${pqr.source ?? "—"} &nbsp;·&nbsp; ${new Date(pqr.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}
  </p>
</body>
</html>`;

    const body: Record<string, unknown> = {
      sender: { name: senderName, email: senderEmail },
      to: recipients.to.map((e) => ({ email: e })),
      subject: emailSubject,
      htmlContent: html,
    };
    if (recipients.cc.length > 0) {
      body.cc = recipients.cc.map((e) => ({ email: e }));
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Brevo PQR email error:", res.status, err);
    } else {
      console.info(
        `PQR email enviado: ticket=${pqr.ticketNumber} módulo=${pqr.module ?? "—"} to=[${recipients.to.join(", ")}]${recipients.cc.length > 0 ? ` cc=[${recipients.cc.join(", ")}]` : ""}`
      );
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
