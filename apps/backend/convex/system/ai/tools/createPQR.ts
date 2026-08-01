import { createTool } from "@convex-dev/agent";
import { jsonSchema } from "ai";
import { api, internal } from "../../../_generated/api";
import { Id } from "../../../_generated/dataModel";
import {
  canAttachPqrEmailLater,
  pqrConfirmationMessage,
  pqrPhoneFromContactId,
} from "../../alcarbon";

/**
 * Registra una PQR (Petición, Queja, Reclamo, Sugerencia o Felicitación) desde el chat.
 * Usar SOLO cuando el cliente ya haya dado tipo, asunto y descripción.
 */
export const createPQR = createTool({
  description:
    "Registrar una PQRSF formal (Petición, Queja, Reclamo, Sugerencia o Felicitación). NO uses para cancelar pedidos; eso es cancelOrderTool. SOLO llama esta herramienta cuando tengas los 3 datos: tipo + asunto + descripción. Requiere: tipo (petition/complaint/claim/suggestion/compliment), asunto y descripción.",
  args: jsonSchema<{
    type: "petition" | "complaint" | "claim" | "suggestion" | "compliment";
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    customerCity?: string;
    module?: string;
    subject: string;
    description: string;
  }>({
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["petition", "complaint", "claim", "suggestion", "compliment"],
        description:
          "Tipo: petition (petición), complaint (queja), claim (reclamo), suggestion (sugerencia), compliment (felicitación)",
      },
      customerName: { type: "string", description: "Nombre del cliente (opcional; si no hay, PQR anónima)" },
      customerPhone: { type: "string", description: "Teléfono (opcional)" },
      customerEmail: { type: "string", description: "Email (opcional)" },
      customerCity: {
        type: "string",
        description: "Ciudad o sede del cliente (ej. Medellín, Bogotá). Requerido para routing de Trabaja con Nosotros.",
      },
      module: {
        type: "string",
        description:
          'Módulo de routing del restaurante. Valores: calidad_alimentos, limpieza, facturacion, domicilios, sugerencias, infraestructura, trabaja_nosotros, proveedores. OBLIGATORIO si el manual del restaurante lo indica.',
      },
      subject: { type: "string", description: "Asunto o resumen de la PQR" },
      description: { type: "string", description: "Descripción detallada" },
    },
    required: ["type", "subject", "description"],
    additionalProperties: false,
  }),
  handler: async (ctx, args) => {
    if (!ctx.threadId) return "Falta el ID del hilo.";

    const conversation = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      { threadId: ctx.threadId }
    );
    if (!conversation) return "Conversación no encontrada.";

    const tenantId = conversation.tenantId;
    const tenant = await ctx.runQuery(api.tenants.get, { tenantId });
    if (tenant?.enabledModules?.pqr === false) {
      return "Este restaurante no tiene habilitado el módulo de PQR (Peticiones, Quejas, Reclamos). No puedo registrar tu solicitud por este canal. Por favor contacta directamente al restaurante.";
    }
    const subject = args.subject.trim();
    const description = args.description.trim();
    if (!subject || !description) {
      return "Faltan asunto o descripción. Pide al cliente que los indique.";
    }

    // Rechazar datos genéricos que la IA haya inventado sin preguntarle al cliente
    const GENERIC_SUBJECTS = [
      "queja del cliente",
      "reclamo del cliente",
      "petición del cliente",
      "sugerencia del cliente",
      "felicitación del cliente",
      "pqr del cliente",
      "pqrs del cliente",
      "solicitud del cliente",
      "el cliente quiere",
    ];
    const subjectLower = subject.toLowerCase();
    const isGenericSubject = GENERIC_SUBJECTS.some((g) =>
      subjectLower.includes(g)
    );
    if (isGenericSubject || subject.length < 5) {
      return "El asunto parece genérico o insuficiente. Debes preguntar al cliente '¿Cuál es el asunto de tu solicitud?' y esperar su respuesta antes de registrar la PQR.";
    }
    if (description.length < 10) {
      return "La descripción es muy corta. Debes preguntar al cliente 'Por favor cuéntame en detalle qué pasó' y esperar su respuesta antes de registrar la PQR.";
    }

    // El teléfono NO puede quedar en blanco: `getRecentOpenByPhone` es lo único
    // que vuelve a encontrar este ticket cuando el cliente responde con su
    // correo (que es exactamente lo que el acuse le pide). El modelo casi nunca
    // manda `customerPhone` —no lo tiene—, así que se completa con el contacto
    // de la conversación, igual que hace el ramal OpenClaw.
    const customerPhone =
      args.customerPhone?.trim() ||
      pqrPhoneFromContactId(conversation.externalContactId);

    const pqrId: Id<"pqrs"> = await ctx.runMutation(api.pqrs.create, {
      tenantId,
      type: args.type as "petition" | "complaint" | "claim" | "suggestion" | "compliment",
      customerName: args.customerName?.trim() || "Anónimo",
      customerPhone,
      customerEmail: args.customerEmail?.trim() || undefined,
      customerCity: args.customerCity?.trim() || undefined,
      module: args.module?.trim() || undefined,
      subject,
      description,
      source: "whatsapp",
      conversationId: conversation._id,
    });

    // Obtener el ticket number generado
    const pqrDoc = await ctx.runQuery(api.pqrs.get, { pqrId });
    const ticketNumber: string = pqrDoc?.ticketNumber ?? String(Date.now()).slice(-6);

    // Texto literal y centralizado (system/alcarbon.ts): se adapta al tipo de PQR
    // —disculpa solo en quejas y reclamos—, al módulo (facturación) y a si el
    // enganche de correo posterior existe de verdad para ESTA conversación. Esta
    // tool corre en todos los tenants con módulo PQR y en cualquier canal, así
    // que la disponibilidad se calcula, no se supone: sin ella el acuse pedía el
    // correo también donde el interceptor nunca lo va a leer.
    const msg: string = pqrConfirmationMessage({
      type: args.type,
      ticketNumber,
      subject,
      module: args.module?.trim() || undefined,
      customerEmail: args.customerEmail?.trim() || undefined,
      emailFollowUpAvailable: canAttachPqrEmailLater({
        channel: conversation.channel,
        customerPhone,
      }),
    });

    try {
      await ctx.runAction(internal.ycloud.sendWhatsAppMessageInternal, {
        tenantId: conversation.tenantId,
        conversationId: conversation._id,
        content: msg,
      });
    } catch {
      // Si falla el envío, el return igual informa al agente
    }
    return msg;
  },
});
