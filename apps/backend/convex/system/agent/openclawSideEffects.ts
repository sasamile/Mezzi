import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { supportAgent } from "../ai/agents/supportAgent";

export type OpenClawSideEffect = {
  kind: string;
  args?: Record<string, unknown>;
};

interface TenantPdf {
  _id: Id<"tenantPdfs">;
  label: string;
  storageId: Id<"_storage">;
  fileName: string;
  url: string | null;
}

function phoneFromContact(contactId: string): string | undefined {
  const raw = contactId.replace(/^whatsapp:/i, "").trim().replace(/\s/g, "");
  return raw || undefined;
}

function numPeople(args: Record<string, unknown>): number | undefined {
  const v =
    args.numberOfPeople ?? args.partySize ?? args.party_size ?? args.people;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return parseInt(v, 10);
  return undefined;
}

/**
 * Ejecuta en Convex lo que OpenClaw decidió (sin pasar por OpenAI).
 * Devuelve si hubo error para ajustar el mensaje al cliente.
 */
export async function applyOpenClawSideEffect(
  ctx: ActionCtx,
  opts: {
    threadId: string;
    tenantId: Id<"tenants">;
    conversationId: Id<"conversations">;
    contactId: string;
    customerName: string;
    hasReservas: boolean;
    hasPdfs: boolean;
  },
  effect: OpenClawSideEffect | null | undefined
): Promise<{ ok: boolean; errorMessage?: string; toolSentWhatsApp?: boolean }> {
  if (!effect?.kind) return { ok: true };

  const { threadId, tenantId, conversationId, contactId, customerName } = opts;

  try {
    switch (effect.kind) {
      case "escalate_to_human": {
        await ctx.runMutation(internal.system.conversations.escalate, {
          threadId,
        });
        await supportAgent.saveMessage(ctx, {
          threadId,
          message: {
            role: "assistant",
            content:
              "He escalado tu consulta a un agente del restaurante. Te contactarán pronto. ¡Gracias por tu paciencia! 🚀",
          },
        });
        return { ok: true };
      }

      case "mark_resolved": {
        await ctx.runMutation(internal.system.conversations.resolve, {
          threadId,
        });
        await supportAgent.saveMessage(ctx, {
          threadId,
          message: {
            role: "assistant",
            content:
              "He marcado esta conversación como resuelta. Si necesitas algo más, estaremos aquí. ¡Que tengas un excelente día! ✨",
          },
        });
        return { ok: true };
      }

      case "send_document_pdf": {
        if (!opts.hasPdfs) {
          return {
            ok: false,
            errorMessage: "Este restaurante no tiene habilitado el envío de PDFs.",
          };
        }
        const label = String(effect.args?.label ?? "").trim();
        if (!label) {
          return { ok: false, errorMessage: "Falta el label del PDF." };
        }
        const allPdfs = (await ctx.runQuery(api.pdfs.list, {
          tenantId,
        })) as TenantPdf[] | null;
        if (!allPdfs?.length) {
          return { ok: false, errorMessage: "No hay PDFs configurados." };
        }
        const labelLower = label.toLowerCase();
        const match =
          allPdfs.find((p) => p.label.toLowerCase() === labelLower) ??
          allPdfs.find((p) => p.label.toLowerCase().includes(labelLower)) ??
          allPdfs.find((p) => labelLower.includes(p.label.toLowerCase()));
        if (!match) {
          const available = allPdfs.map((p) => `"${p.label}"`).join(", ");
          return {
            ok: false,
            errorMessage: `No encontré ese PDF. Disponibles: ${available}.`,
          };
        }
        await ctx.runAction(api.ycloud.sendWhatsAppMedia, {
          tenantId,
          conversationId,
          storageId: match.storageId,
          mediaType: "document",
          caption: `Aquí tienes: *${match.label}* 📄`,
          fileName: match.fileName.toLowerCase().endsWith(".pdf")
            ? match.fileName
            : `${match.fileName}.pdf`,
        });
        return { ok: true, toolSentWhatsApp: true };
      }

      case "create_reservation": {
        if (!opts.hasReservas) {
          return {
            ok: false,
            errorMessage: "Este restaurante no tiene reservas por este canal.",
          };
        }
        const a = effect.args ?? {};
        const name = String(
          a.customerName ?? a.name ?? customerName
        ).trim();
        const date = String(a.date ?? "").trim();
        const time = String(a.time ?? "").trim();
        const numberOfPeople = numPeople(a);
        if (!name || !date || !time || !numberOfPeople) {
          return {
            ok: false,
            errorMessage:
              "Faltan datos para crear la reserva (nombre, fecha, hora o número de personas).",
          };
        }

        const [year, month, day] = date.split("-").map(Number);
        if (!year || !month || !day) {
          return { ok: false, errorMessage: "Fecha inválida (usa YYYY-MM-DD)." };
        }
        const timeMatch = time.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
        let hours = 19;
        let minutes = 0;
        if (timeMatch) {
          hours = parseInt(timeMatch[1], 10);
          minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
          if (timeMatch[3]?.toLowerCase() === "pm" && hours < 12) hours += 12;
          if (timeMatch[3]?.toLowerCase() === "am" && hours === 12) hours = 0;
        }
        const startDate = new Date(year, month - 1, day, hours, minutes, 0);
        const durationMin =
          typeof a.durationMinutes === "number" && a.durationMinutes > 0
            ? a.durationMinutes
            : 120;
        const startTime = startDate.getTime();
        const endTime = startTime + durationMin * 60 * 1000;

        const config = (await ctx.runQuery(api.reservationConfig.getOrDefault, {
          tenantId,
        })) as { maxReservationsPerDay?: number; maxVirtualPerDay?: number };

        const dayStart = new Date(year, month - 1, day, 0, 0, 0).getTime();
        const existingToday = await ctx.runQuery(api.reservations.listByDay, {
          tenantId,
          dayStart,
        });
        const totalToday = existingToday.filter(
          (r: { status: string }) => r.status !== "cancelled"
        ).length;
        if (totalToday >= (config.maxReservationsPerDay ?? 999)) {
          return {
            ok: false,
            errorMessage: "Cupo de reservas para ese día completado.",
          };
        }
        const virtualToday = existingToday.filter(
          (r: { source?: string; status: string }) =>
            r.source === "virtual" && r.status !== "cancelled"
        );
        const maxVirtual = config.maxVirtualPerDay ?? 999;
        if (virtualToday.length >= maxVirtual) {
          return {
            ok: false,
            errorMessage:
              "Cupo de reservas por WhatsApp para ese día completado.",
          };
        }

        const customerPhone =
          typeof a.customerPhone === "string" && a.customerPhone.trim()
            ? a.customerPhone.trim()
            : phoneFromContact(contactId);
        const customerEmail =
          typeof a.customerEmail === "string"
            ? a.customerEmail.trim()
            : undefined;
        const tableNumber =
          typeof a.tableNumber === "string"
            ? a.tableNumber.trim()
            : undefined;
        const notes =
          typeof a.notes === "string" ? a.notes.trim() : undefined;

        try {
          await ctx.runMutation(api.reservations.create, {
            tenantId,
            startTime,
            endTime,
            customerName: name,
            customerPhone,
            customerEmail,
            tableNumber,
            numberOfPeople,
            notes,
            source: "virtual",
            conversationId,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return {
            ok: false,
            errorMessage: `No se pudo guardar la reserva: ${message}`,
          };
        }
        return { ok: true };
      }

      case "create_pqr": {
        const a = effect.args ?? {};
        const pqrType = String(a.type ?? "complaint").trim().toLowerCase();
        const validTypes = ["petition", "complaint", "claim", "suggestion", "compliment"];
        const resolvedType = validTypes.includes(pqrType) ? pqrType : "complaint";
        const subject = String(a.subject ?? "").trim();
        const description = String(a.description ?? "").trim();
        if (!subject || subject.length < 5) {
          return {
            ok: false,
            errorMessage:
              "Falta un asunto claro para la PQR. Pregunta al cliente: '¿Cuál es el motivo de tu solicitud?'",
          };
        }
        if (!description || description.length < 10) {
          return {
            ok: false,
            errorMessage:
              "Falta la descripción del caso. Pregunta al cliente: 'Por favor cuéntame qué pasó.'",
          };
        }
        const pqrName = typeof a.customerName === "string" && a.customerName.trim()
          ? a.customerName.trim()
          : "Anónimo";
        const pqrEmail = typeof a.customerEmail === "string" ? a.customerEmail.trim() || undefined : undefined;
        const pqrPhone = typeof a.customerPhone === "string"
          ? a.customerPhone.trim() || undefined
          : phoneFromContact(contactId) || undefined;
        const pqrCity =
          (typeof a.customerCity === "string" && a.customerCity.trim()) ||
          (typeof a.sede === "string" && a.sede.trim()) ||
          (typeof a.city === "string" && a.city.trim()) ||
          undefined;
        const pqrModule =
          typeof a.module === "string" && a.module.trim()
            ? a.module.trim()
            : undefined;

        try {
          const pqrId: Id<"pqrs"> = await ctx.runMutation(api.pqrs.create, {
            tenantId,
            type: resolvedType as "petition" | "complaint" | "claim" | "suggestion" | "compliment",
            customerName: pqrName,
            customerEmail: pqrEmail,
            customerPhone: pqrPhone,
            customerCity: pqrCity,
            module: pqrModule,
            subject,
            description,
            source: "whatsapp",
          });
          const pqrDoc = await ctx.runQuery(api.pqrs.get, { pqrId });
          const ticket = pqrDoc?.ticketNumber ?? String(Date.now()).slice(-6);
          const TYPE_LABELS: Record<string, string> = {
            petition: "Petición",
            complaint: "Queja",
            claim: "Reclamo",
            suggestion: "Sugerencia",
            compliment: "Felicitación",
          };
          const label = TYPE_LABELS[resolvedType] ?? resolvedType;
          console.log("openclawSideEffects: PQR creada", { pqrId, ticket, type: resolvedType });
          return {
            ok: true,
            pqrTicket: ticket,
            pqrTypeLabel: label,
          } as { ok: true; errorMessage?: undefined; toolSentWhatsApp?: boolean; pqrTicket?: string; pqrTypeLabel?: string };
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return {
            ok: false,
            errorMessage: `No se pudo registrar la PQR: ${message}`,
          };
        }
      }

      case "set_priority": {
        const raw = String(effect.args?.priority ?? "high").trim().toLowerCase();
        const PRIORITY_MAP: Record<string, "low" | "normal" | "high" | "urgent"> = {
          low: "low",
          normal: "normal",
          medium: "normal",
          high: "high",
          urgent: "urgent",
        };
        const resolved = PRIORITY_MAP[raw] ?? "high";
        try {
          await ctx.runMutation(api.conversations.updatePriority, {
            conversationId,
            priority: resolved,
          });
        } catch {
          // No crítico
        }
        return { ok: true };
      }

      case "search_job_vacancies":
        return { ok: true };

      case "search_products":
        return { ok: true };

      default:
        return { ok: true };
    }
  } catch (e) {
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Misma lógica que searchVacanciesTool pero para inyectar texto en OpenClaw (sin hilo de agente).
 */
export async function getVacanciesMarkdownForOpenClaw(
  ctx: ActionCtx,
  tenantId: Id<"tenants">,
  cityFilter?: string
): Promise<string> {
  const tenant = await ctx.runQuery(api.tenants.get, { tenantId });
  if (tenant?.enabledModules?.trabajaConNosotros === false) {
    return "Módulo Trabaja con nosotros deshabilitado para este restaurante.";
  }

  const locations = (await ctx.runQuery(api.jobLocations.list, {
    tenantId,
    city: cityFilter?.trim() || undefined,
  })) as Doc<"jobLocations">[];

  if (!locations.length) {
    return "No hay vacantes registradas en el sistema para ese criterio (lista vacía). Indica otra ciudad o informa que no hay datos.";
  }

  const byCity = locations.reduce<Record<string, Doc<"jobLocations">[]>>(
    (acc, loc) => {
      if (!acc[loc.city]) acc[loc.city] = [];
      acc[loc.city].push(loc);
      return acc;
    },
    {}
  );

  const lines: string[] = [
    "DATOS OFICIALES DE VACANTES (copiar textualmente sedes y cargos; no inventar):",
    "",
  ];
  for (const [city, locs] of Object.entries(byCity).sort()) {
    lines.push(`*${city}*`);
    for (const loc of locs.sort((a, b) => a.mallName.localeCompare(b.mallName))) {
      const name = loc.isPrincipal ? `${loc.mallName} (Principal)` : loc.mallName;
      const vacs = loc.vacancies.length
        ? loc.vacancies.join(", ")
        : "Sin vacantes específicas";
      lines.push(`- ${name}: ${vacs}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
