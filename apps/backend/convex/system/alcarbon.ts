import type { Doc } from "../_generated/dataModel";

/** Dominio dedicado del tenant Al Carbón. */
export const ALCARBON_DOMAIN = "alcarbon.mezzi.app";

export function normalizeHost(value?: string | null): string | null {
  if (!value) return null;
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .split(":")[0] || null
  );
}

export function isAlcarbonTenant(
  tenant: Doc<"tenants"> | null | undefined
): boolean {
  if (!tenant) return false;
  if (normalizeHost(tenant.customDomain) === ALCARBON_DOMAIN) return true;
  return /al carb[oó]n/i.test(tenant.name);
}

/** PDFs desactivados por defecto en Al Carbón; superadmin puede activarlos explícitamente. */
export function isPdfsModuleEnabled(
  tenant: Doc<"tenants"> | null | undefined
): boolean {
  if (!tenant) return true;
  if (isAlcarbonTenant(tenant)) return tenant.enabledModules?.pdfs === true;
  return tenant.enabledModules?.pdfs !== false;
}

/** Sin chat en vivo: recepción, clasificación y derivación por correo. */
export function isEmailOnlySupportTenant(
  tenant: Doc<"tenants"> | null | undefined
): boolean {
  return isAlcarbonTenant(tenant);
}

export const PQR_REGISTERED_ACK_MESSAGE =
  "Tu solicitud quedó registrada correctamente. Nuestro equipo la revisará y te contactará por correo electrónico si es necesario. Gracias por escribirnos.";

export function pqrAlreadyRegisteredMessage(ticketNumber: string): string {
  return (
    `Tu solicitud ya fue registrada con el ticket #${ticketNumber}. ` +
    "Nuestro equipo la está revisando y te contactará por correo electrónico si hace falta. " +
    "Gracias por tu paciencia."
  );
}

/** Contexto operativo inyectado al prompt del bot (Al Carbón). */
export function emailOnlySupportPromptBlock(): string {
  return `[MODO OPERATIVO — AL CARBÓN]
- NO hay atención humana en vivo por WhatsApp. NO transfieras a especialista ni agente humano.
- PROHIBIDO decir: "te transfiero con un especialista", "un agente te atenderá", "te contactarán pronto por chat".
- Si el cliente pide hablar con una persona: registra la PQR con createPQRTool (o side_effect create_pqr) si aún no está registrada, y confirma que el equipo revisará por correo.
- NUNCA uses escalateConversationTool ni escalate_to_human.
- Tras registrar una PQR, confirma el ticket y que el seguimiento es por correo.
- Si el cliente insiste preguntando por su caso y ya hay ticket activo, responde que ya está registrado y en revisión por correo (no repitas todo el flujo).
[Fin MODO OPERATIVO]

`;
}

/** Detecta mensajes de seguimiento / insistencia tras una PQR. */
export function looksLikePqrFollowUp(text: string): boolean {
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /estado|respuesta|registr|esperando|alguien|atiend|persona|humano|especialista|cuando|sigue|todavia|ya envie|ya envié|mi caso|mi solicitud|ticket|pqrs|queja|reclamo/.test(
    t
  );
}

export function normalizePhoneForPqr(value: string): string {
  return value.replace(/^whatsapp:/i, "").replace(/\D/g, "").slice(-10);
}
