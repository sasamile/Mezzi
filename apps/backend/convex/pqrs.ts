import { action, internalAction, mutation, query } from "./_generated/server";
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

/** PQR abierta más reciente del cliente (por teléfono), para mensajes de insistencia. */
export const getRecentOpenByPhone = query({
  args: {
    tenantId: v.id("tenants"),
    customerPhone: v.string(),
  },
  handler: async (ctx, args) => {
    const digits = args.customerPhone.replace(/\D/g, "").slice(-10);
    if (digits.length < 7) return null;

    const rows = await ctx.db
      .query("pqrs")
      .withIndex("by_tenant_created", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(80);

    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return (
      rows.find((p) => {
        if (p.createdAt < cutoff) return false;
        if (p.status !== "open" && p.status !== "in_progress") return false;
        const phone = p.customerPhone?.replace(/\D/g, "").slice(-10);
        return phone === digits;
      }) ?? null
    );
  },
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

const TYPE_DEFAULT_MODULE: Partial<
  Record<
    "petition" | "complaint" | "claim" | "suggestion" | "compliment",
    string
  >
> = {
  suggestion: "sugerencias",
  compliment: "sugerencias",
};

/** Infiere el módulo de routing a partir del texto cuando el bot no lo envió. */
function inferModuleFromText(subject: string, description: string): string | undefined {
  const text = normalize(`${subject} ${description}`);
  if (/factur|pago|cuenta|recibo/.test(text)) return "facturacion";
  if (/domicil|delivery|repart|pedido/.test(text)) return "domicilios";
  if (/limp|higien|bano|baño|aseo/.test(text)) return "limpieza";
  if (/infra|mueble|silla|mesa|instalac|local|sede/.test(text)) return "infraestructura";
  if (/proveedor|suministro|compra/.test(text)) return "proveedores";
  if (/trabaj|vacante|empleo|curriculum|curriculo|hoja de vida/.test(text))
    return "trabaja_nosotros";
  if (/suger|felicit|agradec|compliment/.test(text)) return "sugerencias";
  if (/comida|plato|bebida|alimento|sabor|calidad|carne|pollo/.test(text))
    return "calidad_alimentos";
  return undefined;
}

function resolvePqrModule(
  pqr: {
    type: string;
    module?: string;
    subject: string;
    description: string;
  }
): string | undefined {
  const explicit = pqr.module?.trim();
  if (explicit) return explicit;

  const fromType = TYPE_DEFAULT_MODULE[pqr.type as keyof typeof TYPE_DEFAULT_MODULE];
  if (fromType) return fromType;

  const fromText = inferModuleFromText(pqr.subject, pqr.description);
  if (fromText) return fromText;

  if (pqr.type === "complaint" || pqr.type === "claim") {
    return "calidad_alimentos";
  }

  if (pqr.type === "petition") {
    return "calidad_alimentos";
  }

  return undefined;
}

/**
 * Dado el tenant y la PQR, devuelve { to, cc } resueltos.
 *
 * Lógica:
 * 1. Si el tenant tiene pqrEmailRouting → infiere o usa pqr.module y busca la primera
 *    regla cuyo module coincida (exacto, normalizado) y, si tiene cityMatch, que el
 *    customerCity de la PQR incluya ese substring (normalizado).
 * 2. Si no hay match en el routing → cae en pqrNotificationEmails (comportamiento anterior).
 * 3. Si tampoco hay pqrNotificationEmails → no se envía nada.
 */
function resolveRecipients(
  tenant: {
    name?: string;
    pqrEmailRouting?: Array<{ module: string; cityMatch?: string; to: string[]; cc?: string[] }>;
    pqrNotificationEmails?: string[];
  },
  pqr: {
    type: string;
    module?: string;
    customerCity?: string;
    subject: string;
    description: string;
  }
): { to: string[]; cc: string[] } | null {
  const routing = tenant.pqrEmailRouting ?? [];
  const pqrModule = resolvePqrModule(pqr);

  if (routing.length > 0 && pqrModule) {
    const normalizedModule = normalize(pqrModule);
    const pqrCity = pqr.customerCity ? normalize(pqr.customerCity) : "";

    for (const rule of routing) {
      if (normalize(rule.module) !== normalizedModule) continue;
      if (rule.cityMatch && !pqrCity.includes(normalize(rule.cityMatch))) continue;
      return {
        to: rule.to.map((e) => e.trim()).filter(Boolean),
        cc: (rule.cc ?? []).map((e) => e.trim()).filter(Boolean),
      };
    }
    console.info(
      `PQR routing: módulo "${pqrModule}" sin regla exacta para tenant ${tenant.name ?? "—"}, usando fallback`
    );
  } else if (routing.length > 0 && !pqrModule) {
    console.warn(
      `PQR routing: tenant ${tenant.name ?? "—"} tiene reglas pero no se pudo inferir módulo (type=${pqr.type})`
    );
  }

  const fallback = (tenant.pqrNotificationEmails ?? []).map((e) => e.trim()).filter(Boolean);
  if (fallback.length === 0) return null;
  return { to: fallback, cc: [] };
}

/** Agrega el email del cliente en CC si existe y no está ya en to/cc. */
function withCustomerCc(
  recipients: { to: string[]; cc: string[] },
  customerEmail?: string | null
): { to: string[]; cc: string[] } {
  const email = customerEmail?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return recipients;
  }
  const normalized = email.toLowerCase();
  const already =
    recipients.to.some((e) => e.toLowerCase() === normalized) ||
    recipients.cc.some((e) => e.toLowerCase() === normalized);
  if (already) return recipients;
  return { ...recipients, cc: [...recipients.cc, email] };
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

type PqrEmailResult =
  | { ok: true; to: string[]; cc: string[] }
  | { ok: false; error: string };

/** Envía por Brevo la notificación de PQR al correo que corresponde según el módulo */
export const sendPqrNotificationEmail = internalAction({
  args: {
    pqrId: v.id("pqrs"),
    isResend: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<PqrEmailResult> => {
    const pqr = await ctx.runQuery(api.pqrs.get, { pqrId: args.pqrId });
    if (!pqr) return { ok: false as const, error: "PQR no encontrada" };
    const tenant = await ctx.runQuery(api.tenants.get, { tenantId: pqr.tenantId });
    if (!tenant) return { ok: false as const, error: "Restaurante no encontrado" };

    const resolved = resolveRecipients(tenant, pqr);
    if (!resolved || resolved.to.length === 0) {
      console.warn(
        "PQR email: sin destinatarios — tenant=%s routing=%s module=%s type=%s fallbackEmails=%s",
        tenant.name,
        (tenant.pqrEmailRouting ?? []).length,
        pqr.module ?? resolvePqrModule(pqr) ?? "—",
        pqr.type,
        (tenant.pqrNotificationEmails ?? []).length
      );
      return {
        ok: false as const,
        error: "No hay destinatarios configurados para este PQR",
      };
    }

    const recipients = withCustomerCc(resolved, pqr.customerEmail);

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL ?? "noreply@example.com";
    const senderName = process.env.BREVO_SENDER_NAME ?? tenant.name ?? "Sistema";
    if (!apiKey) {
      console.warn("BREVO_API_KEY no configurada, no se envía email de PQR");
      return { ok: false as const, error: "Servicio de email no configurado (BREVO_API_KEY)" };
    }

    const typeLabel = TYPE_LABELS[pqr.type] ?? pqr.type;
    const moduleLabel = pqr.module ? (MODULE_LABELS[pqr.module] ?? pqr.module) : null;
    const subjectBase = moduleLabel
      ? `[${moduleLabel}] Nueva ${typeLabel} - ${pqr.subject}`
      : `[PQR] Nueva ${typeLabel} - ${pqr.subject}`;
    const emailSubject = args.isResend ? `Reenvío: ${subjectBase}` : subjectBase;

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
      return {
        ok: false as const,
        error: `Error al enviar email (${res.status})`,
      };
    }

    console.info(
      `PQR email enviado: ticket=${pqr.ticketNumber} módulo=${pqr.module ?? "—"} to=[${recipients.to.join(", ")}]${recipients.cc.length > 0 ? ` cc=[${recipients.cc.join(", ")}]` : ""}${args.isResend ? " (reenvío)" : ""}`
    );
    return {
      ok: true as const,
      to: recipients.to,
      cc: recipients.cc,
    };
  },
});

/** Reenvía la notificación por email (desde el panel). */
export const resendNotificationEmail = action({
  args: { pqrId: v.id("pqrs") },
  handler: async (ctx, args): Promise<PqrEmailResult> => {
    return await ctx.runAction(internal.pqrs.sendPqrNotificationEmail, {
      pqrId: args.pqrId,
      isResend: true,
    });
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
