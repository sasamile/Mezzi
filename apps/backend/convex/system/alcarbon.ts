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

/**
 * Respuesta cuando el cliente pide hablar con una persona.
 *
 * NO afirma que haya nada registrado ni promete correos: en este punto no se
 * ha creado ninguna PQR y el cliente puede no haber dado nunca su correo.
 *
 * TAMPOCO le pide el correo. El único mecanismo que engancha un correo suelto a
 * un caso (`attachCustomerEmail` + el interceptor de system/ycloud.ts) necesita
 * una PQR ABIERTA a la que sumarlo, y aquí todavía no existe ninguna: pedirlo
 * dejaría al cliente mandando un correo que o se pierde, o —peor— se engancha
 * a un ticket viejo suyo sin relación con lo que está pidiendo ahora. El correo
 * se pide DESPUÉS de registrar el caso, en `pqrAckParts`.
 *
 * Lo único que promete es lo que sí es cierto sin depender de nada: el equipo
 * del restaurante ve esta conversación en su bandeja y puede contestar por
 * WhatsApp.
 */
export const HUMAN_HANDOFF_UNAVAILABLE_MESSAGE =
  "Por este canal no tenemos asesores conectados al instante, pero el equipo del restaurante ve esta conversación y te responde por este mismo WhatsApp. " +
  "Cuéntame qué necesitas y lo dejo anotado para que lo atiendan. Gracias por escribirnos.";

// ─── Confirmación de PQR al cliente ────────────────────────────────────────────
//
// Todos los textos de confirmación viven aquí. Antes había cuatro redacciones
// distintas repartidas por el pipeline (tool del agente, side_effect de
// OpenClaw, acuse de escalamiento) y cada una decía algo diferente.

/** Tipos de PQR del sistema (mismo enum que la tool del agente y el side_effect). */
export type PqrType =
  | "petition"
  | "complaint"
  | "claim"
  | "suggestion"
  | "compliment";

/** Etiqueta en español de cada tipo. */
export const PQR_TYPE_LABELS: Record<PqrType, string> = {
  petition: "Petición",
  complaint: "Queja",
  claim: "Reclamo",
  suggestion: "Sugerencia",
  compliment: "Felicitación",
};

/** Género de la etiqueta, para concordar "registrado" / "registrada". */
const PQR_TYPE_GENDER: Record<PqrType, "m" | "f"> = {
  petition: "f",
  complaint: "f",
  claim: "m",
  suggestion: "f",
  compliment: "f",
};

/** Sinónimos en español que el planner suele devolver en vez del enum. */
const PQR_TYPE_ALIASES: Record<string, PqrType> = {
  peticion: "petition",
  solicitud: "petition",
  queja: "complaint",
  reclamo: "claim",
  reclamacion: "claim",
  sugerencia: "suggestion",
  felicitacion: "compliment",
  agradecimiento: "compliment",
};

/** Normaliza cualquier valor al tipo de PQR; null si no se reconoce. */
export function normalizePqrType(
  value: string | null | undefined
): PqrType | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw in PQR_TYPE_LABELS) return raw as PqrType;
  const sinAcentos = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return PQR_TYPE_ALIASES[sinAcentos] ?? null;
}

/** Etiqueta en español; si el tipo no se reconoce, devuelve "solicitud". */
export function pqrTypeLabel(value: string | null | undefined): string {
  const type = normalizePqrType(value);
  return type ? PQR_TYPE_LABELS[type] : "solicitud";
}

export type PqrAckInput = {
  /** Tipo de PQR. Si no se reconoce, el mensaje sale neutro (sin disculpa). */
  type?: string | null;
  /** Número de ticket ya generado por `pqrs.create`. */
  ticketNumber: string;
  /** Asunto exacto que dio el cliente (opcional). */
  subject?: string | null;
  /** Módulo de routing (ej. "facturacion") para afinar qué se promete enviar. */
  module?: string | null;
  /** Correo del cliente. Sin él NO prometemos enviar nada por correo. */
  customerEmail?: string | null;
  /**
   * ¿Existe de verdad el mecanismo que engancharía a este ticket el correo que
   * el cliente mande después?
   *
   * Sin esto el acuse le pedía el correo SIEMPRE ("respóndeme con tu correo y
   * lo sumo a tu ticket"), pero el único sitio que cumple esa promesa es el
   * interceptor de `processInboundMessageBatched`, que solo corre en WhatsApp y
   * solo reencuentra el ticket por teléfono. Fuera de ahí el cliente mandaba su
   * correo a un buzón que nadie lee.
   *
   * Lo calculan los llamadores con `canAttachPqrEmailLater` y lo pasan
   * explícito: el texto no adivina.
   *
   * AUSENTE significa NO DISPONIBLE, no lo contrario. El default tiene que ser
   * el que no promete: un generador nuevo que se olvide de pasarlo emitirá un
   * acuse honesto de menos, nunca una promesa incumplible de más. Los acuses
   * que nacen dentro del propio interceptor lo pasan en `true` explícito (ahí
   * está probado que el enganche funciona, porque acaba de funcionar).
   */
  emailFollowUpAvailable?: boolean;
};

/**
 * ¿Podrá el sistema enganchar a este ticket el correo que el cliente mande
 * después?
 *
 * Es, punto por punto, la puerta del interceptor de correo suelto
 * (`processInboundMessageBatched`): solo se ejecuta en el canal WhatsApp y solo
 * vuelve a encontrar la PQR por teléfono, vía `getRecentOpenByPhone`, que
 * descarta cualquier número de menos de 7 dígitos. Si falla cualquiera de las
 * dos, pedirle el correo al cliente es prometerle un enganche que nadie hará.
 */
export function canAttachPqrEmailLater(input: {
  channel?: string | null;
  customerPhone?: string | null;
}): boolean {
  if (input.channel !== "whatsapp") return false;
  return normalizePhoneForPqr(input.customerPhone ?? "").length >= 7;
}

type PqrAckParts = {
  /** Disculpa inicial. Vacía salvo en quejas y reclamos. */
  apology: string;
  /** Qué recibirá el cliente y por dónde. */
  body: string;
  /** Cierre de agradecimiento, adaptado al tipo. */
  closing: string;
};

/** Minúsculas, sin tildes y sin espacios sobrantes. */
function normalizeModule(value?: string | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * ¿La solicitud es de facturación (factura electrónica, soportes de pago)?
 *
 * Se quitan los diacríticos igual que en `normalize()` de pqrs.ts: el planner
 * escribe en español y manda "facturación" con tilde tan a menudo como sin
 * ella. Comparando en crudo el correo sí llegaba al buzón de Facturación (allí
 * sí se normaliza) pero el cliente recibía el texto genérico en vez de la
 * redacción específica de factura electrónica.
 */
function isBillingRequest(module?: string | null): boolean {
  return normalizeModule(module) === "facturacion";
}

/**
 * Piezas del acuse, adaptadas al tipo de PQR.
 *
 * Regla dura: solo quejas y reclamos llevan disculpa. Disculparse ante una
 * felicitación o ante una petición neutra suena a error del sistema.
 */
function pqrAckParts(input: PqrAckInput): PqrAckParts {
  const type = normalizePqrType(input.type);
  const hasEmail = Boolean(input.customerEmail?.trim());
  const billing = isBillingRequest(input.module);

  const apology =
    type === "complaint" || type === "claim"
      ? "Lamentamos mucho lo sucedido."
      : "";

  const closing =
    type === "compliment"
      ? "¡Gracias por tomarte el tiempo de escribirnos! 🙌"
      : type === "complaint" || type === "claim" || type === "suggestion"
        ? "Gracias por ayudarnos a mejorar. 🙏"
        : "Gracias por escribirnos. 🙏";

  // A una felicitación no se le "envía lo solicitado": no hay nada pendiente.
  if (type === "compliment") {
    return {
      apology,
      body: "Le compartiremos tu mensaje a todo el equipo; nos alegra muchísimo saber que la pasaste bien con nosotros.",
      closing,
    };
  }

  if (!hasEmail) {
    // Pedir el correo solo tiene sentido si algo va a hacer con él. Cuando el
    // enganche no está disponible (canal que el interceptor no vigila, o PQR
    // sin teléfono con el que reencontrarla) el cliente mandaría su correo a un
    // buzón que nadie lee y encima creyendo que quedó anotado: aquí se le dice
    // lo único que sí es cierto —su caso está registrado y el equipo lo ve— y
    // se le deja el ticket para hacer seguimiento.
    //
    // El flag ausente cae aquí a propósito (ver `PqrAckInput`): callar es
    // siempre menos grave que prometer un enganche que nadie va a hacer.
    if (!input.emailFollowUpAvailable) {
      return {
        apology,
        body: billing
          ? "Nuestro equipo de facturación ya tiene tu solicitud y te responde por este mismo canal. Guarda el número de ticket para hacer seguimiento."
          : "Nuestro equipo ya está revisando tu caso y te responde por este mismo canal. Guarda el número de ticket para hacer seguimiento.",
        closing,
      };
    }

    // Sin correo no podemos prometer un envío que el cliente no va a recibir.
    // Se le pide el correo de forma explícita porque sí sabemos qué hacer con
    // él: si lo manda, se engancha al ticket (ver `attachCustomerEmail` y el
    // interceptor de system/ycloud.ts) y se reenvía la notificación con él en
    // copia.
    return {
      apology,
      body: billing
        ? "Respóndeme con el correo al que quieres recibir la factura electrónica y lo dejo anotado en tu ticket para que te la envíen allí."
        : "Nuestro equipo ya está revisando tu caso. Si quieres recibir la respuesta por correo, respóndeme con tu correo electrónico y lo sumo a tu ticket.",
      closing,
    };
  }

  // Ojo con lo que se promete aquí: el sistema NO envía facturas ni respuestas
  // automáticas. Lo único automático es la notificación interna al buzón del
  // restaurante (con el cliente en copia). El envío real lo hace una persona,
  // así que el texto no promete inmediatez y deja una salida si no llega.
  const body = billing
    ? "Al correo que nos indicaste te enviaremos la factura electrónica. La envía el equipo de facturación, así que puede tomar unas horas hábiles; si no te llega, escríbenos con el número de ticket y lo revisamos."
    : type === "complaint" || type === "claim"
      ? "Al correo que nos indicaste te enviaremos la respuesta de tu caso apenas el equipo lo revise."
      : type === "suggestion"
        ? "Al correo que nos indicaste te enviaremos la respuesta a tu sugerencia."
        : "Al correo que nos indicaste te enviaremos la respuesta a lo que nos pediste.";

  return { apology, body, closing };
}

/**
 * Mensaje completo de confirmación que recibe el cliente por WhatsApp tras
 * registrar una PQR. Es texto literal: la tool se autoenvía y el modelo no lo
 * reescribe (ver SELF_SENDING_TOOLS en system/ycloud.ts).
 */
export function pqrConfirmationMessage(input: PqrAckInput): string {
  const { apology, body, closing } = pqrAckParts(input);
  const type = normalizePqrType(input.type);
  const label = pqrTypeLabel(input.type);
  const registrada =
    type && PQR_TYPE_GENDER[type] === "m" ? "registrado" : "registrada";

  const bloques: string[] = [];
  if (apology) bloques.push(apology);
  bloques.push(`✅ Tu ${label} quedó ${registrada} correctamente.`);
  const subject = input.subject?.trim();
  bloques.push(
    subject
      ? `📋 Ticket #${input.ticketNumber}\nAsunto: ${subject}`
      : `📋 Ticket #${input.ticketNumber}`
  );
  bloques.push(body);
  bloques.push(closing);
  return bloques.join("\n\n");
}

/**
 * Misma confirmación, pero para añadir al final del mensaje que ya redactó el
 * modelo (ramal OpenClaw). No repite el encabezado "Tu Queja quedó registrada"
 * porque ese texto suele venir ya en el mensaje del modelo.
 */
export function pqrConfirmationSuffix(input: PqrAckInput): string {
  const { apology, body, closing } = pqrAckParts(input);
  const label = pqrTypeLabel(input.type);

  const bloques: string[] = [];
  if (apology) bloques.push(apology);
  bloques.push(
    `📋 Ticket #${input.ticketNumber} (${label}) registrado exitosamente.`
  );
  bloques.push(body);
  bloques.push(closing);
  return bloques.join("\n\n");
}

// El modelo (ramal OpenClaw) redacta su propio mensaje siguiendo las reglas de
// EMAIL_ONLY_RULES, que le piden disculparse en quejas y cerrar agradeciendo.
// El acuse trae esas mismas piezas, así que hay que detectar cuáles ya dijo.
const APOLOGY_RE = /lamenta|sentimos mucho|una disculpa|disculpa[sn]? por|perd[oó]n/i;
const CLOSING_RE = /gracias por/i;

/**
 * Pega el acuse de PQR al mensaje que ya redactó el modelo, sin repetir lo que
 * el modelo ya dijo.
 *
 * Sin esto el cliente recibe una sola burbuja de WhatsApp que se disculpa dos
 * veces y agradece dos veces: comparar el número de ticket no sirve, porque el
 * ticket se genera DESPUÉS de que el modelo escribe y nunca puede estar en su
 * texto. Se compara por intención (hay disculpa / hay agradecimiento), no por
 * literal, porque el prompt dice "Lamentamos lo sucedido" y el acuse
 * "Lamentamos mucho lo sucedido".
 */
export function mergePqrAckSuffix(outbound: string, suffix: string): string {
  const base = outbound.trim();
  const acuse = suffix.trim();
  if (!base) return acuse;
  if (!acuse) return base;

  const bloques = acuse
    .split("\n\n")
    .map((b) => b.trim())
    .filter(Boolean)
    .filter((b) => {
      if (APOLOGY_RE.test(b) && APOLOGY_RE.test(base)) return false;
      if (CLOSING_RE.test(b) && CLOSING_RE.test(base)) return false;
      return true;
    });

  if (!bloques.length) return base;
  return `${base}\n\n${bloques.join("\n\n")}`;
}

/**
 * Respuesta a la insistencia del cliente cuando su PQR ya existe.
 *
 * Recibe el doc completo, no solo el ticket: sin el tipo y el correo el
 * mensaje prometía envíos a correos que nadie dio y "respuestas" a
 * felicitaciones, que no tienen nada pendiente que responder.
 */
export function pqrAlreadyRegisteredMessage(input: PqrAckInput): string {
  const { body, closing } = pqrAckParts(input);
  const type = normalizePqrType(input.type);
  const label = pqrTypeLabel(input.type).toLowerCase();
  const registrada =
    type && PQR_TYPE_GENDER[type] === "m" ? "registrado" : "registrada";

  return [
    `Tu ${label} ya está ${registrada} con el ticket #${input.ticketNumber}.`,
    body,
    closing,
  ].join("\n\n");
}

/**
 * Confirmación de que el correo del cliente quedó anotado en su ticket.
 *
 * Recibe la PQR entera (no solo el ticket) y arma el cuerpo con `pqrAckParts`,
 * igual que los demás acuses. Es la única forma de respetar la regla general:
 * `getRecentOpenByPhone` no filtra por tipo, así que el correo suelto puede
 * acabar enganchado a una FELICITACIÓN abierta, y ahí prometer "te enviaremos
 * la respuesta" sería exactamente el envío inexistente que toda la suite
 * persigue. `customerEmail` es obligatorio a propósito: este mensaje solo
 * existe cuando el correo ya se anotó.
 */
export function pqrEmailAttachedMessage(
  input: PqrAckInput & { customerEmail: string }
): string {
  const { body, closing } = pqrAckParts(input);
  return [
    `Listo, anotamos ${input.customerEmail.trim()} en tu ticket #${input.ticketNumber}.`,
    body,
    closing,
  ].join("\n\n");
}

const EMAIL_RE = /[^\s<>()[\],;:@"]+@[^\s<>()[\],;:@"]+\.[a-z]{2,}/i;

/**
 * Primer correo electrónico que aparezca en el texto, o null.
 *
 * Sirve para enganchar a un ticket existente el correo que el cliente manda
 * suelto ("juan@gmail.com") después de que se lo pedimos.
 */
export function extractEmail(text: string): string | null {
  const match = text.match(EMAIL_RE);
  if (!match) return null;
  return match[0].replace(/[.,;:]+$/, "").toLowerCase();
}

/** Minúsculas y sin tildes, para comparar texto libre del cliente. */
function normalizarTexto(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Palabras que pueden acompañar a un correo suelto sin cambiar su intención.
 *
 * Es una lista blanca a propósito. Medir la longitud del resto (el criterio
 * anterior: "≤ 40 caracteres") no distingue "mi correo electrónico es X" —24
 * caracteres— de "llego frio otra vez, correo X" —27—, así que una QUEJA REAL
 * cabía dentro del umbral y se la tragaba el interceptor: se anotaba el correo,
 * se respondía "listo, lo anotamos" y el bot nunca llegaba a leer la queja.
 */
const RELLENO_CORREO = new Set([
  "a", "ahi", "al", "anota", "anotalo", "anoten", "apunta", "aqui", "buenas",
  "buenos", "claro", "correo", "correos", "de", "dejo", "dias", "direccion",
  "el", "electronica", "electronico", "email", "en", "envia", "envialo",
  "enviamelo", "enviarlo", "es", "esa", "ese", "esta", "este", "favor",
  "gracias", "hola", "la", "las", "le", "listo", "lo", "los", "mail", "manda",
  "mandalo", "mandamelo", "mandenlo", "mi", "mis", "no", "noches", "ok", "para",
  "por", "porfa", "seria", "senor", "senora", "si", "son", "tardes", "te", "un",
  "una", "va", "y", "ya",
]);

/**
 * ¿El mensaje es básicamente un correo suelto? ("juan@gmail.com", "mi correo
 * es juan@gmail.com").
 *
 * Se exige que, quitando el correo, no quede NINGUNA palabra con contenido: si
 * el cliente aprovecha para contar otra cosa, el mensaje tiene que seguir su
 * camino al bot y no morir en el interceptor que solo anota el correo.
 */
export function looksLikeBareEmail(text: string): boolean {
  const match = text.match(EMAIL_RE);
  if (!match) return false;
  const palabras = normalizarTexto(text.replace(match[0], " "))
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return palabras.every((p) => RELLENO_CORREO.has(p));
}

/** Reglas de trato del modo email-only. Fuente única para los dos ramales. */
const EMAIL_ONLY_RULES: string[] = [
  "NO hay atención humana en vivo por WhatsApp. NO transfieras a especialista ni agente humano.",
  'PROHIBIDO decir: "te transfiero con un especialista", "un agente te atenderá", "te contactarán pronto por chat", "te contactaremos si es necesario".',
  "Si el cliente pide hablar con una persona: registra la PQR con createPQRTool (o side_effect create_pqr) si aún no está registrada.",
  "NUNCA uses escalateConversationTool ni escalate_to_human.",
  "Solo puedes prometer envíos por correo SI el cliente ya dio su correo. Si no lo ha dado, pídeselo y no prometas nada todavía.",
  "Tras registrar una PQR, confirma el ticket y, si hay correo, di que allí le enviaremos la respuesta.",
  'Si es QUEJA o RECLAMO, empieza con una disculpa ("Lamentamos lo sucedido") y cierra con "Gracias por ayudarnos a mejorar".',
  "NUNCA te disculpes ante una FELICITACIÓN ni ante una petición neutra: ahí solo agradece.",
  "Si el cliente insiste preguntando por su caso y ya hay ticket activo, responde que ya está registrado y en revisión (no repitas todo el flujo).",
];

/** Contexto operativo inyectado al prompt del bot (ramal supportAgent). */
export function emailOnlySupportPromptBlock(): string {
  return `[MODO OPERATIVO — AL CARBÓN]
${EMAIL_ONLY_RULES.map((r) => `- ${r}`).join("\n")}
[Fin MODO OPERATIVO]

`;
}

/**
 * Las mismas reglas, en una línea, para el ramal OpenClaw.
 *
 * OpenClaw es el camino primario de WhatsApp y no recibe `modulesContext`: solo
 * se le pasa `modulesLine`. Sin esto, todas las reglas de arriba serían código
 * muerto en producción.
 */
export function emailOnlySupportGatewayLine(): string {
  return `SOPORTE POR CORREO — ${EMAIL_ONLY_RULES.join(" ")}`;
}

/**
 * Frases con las que un cliente pregunta por un caso YA registrado.
 *
 * Deliberadamente específicas. La versión anterior buscaba subcadenas sueltas
 * ("atiend", "persona", "cuando", "sigue", "alguien") y secuestraba preguntas
 * cotidianas: "¿a qué hora atienden hoy?", "somos 6 personas, ¿tienen mesa?" o
 * "¿sigue la promo?" recibían "tu queja ya está registrada con el ticket #N" y
 * nunca se respondía lo que el cliente había preguntado. Aquí solo entran giros
 * que no tienen sentido fuera de un seguimiento.
 */
const PQR_FOLLOW_UP_PATTERNS: RegExp[] = [
  /\bticket\b/,
  /\bpqrs?f?\b/,
  /\bmi (?:caso|solicitud|queja|reclamo|peticion|sugerencia|pqr|ticket|reporte|factura)\b/,
  /\b(?:estado|seguimiento|novedad|novedades|avance|respuesta|solucion) (?:de|sobre) (?:mi|el|la|ese|este|esa|esta)\b/,
  /\b(?:alguna|hay|tienen) (?:novedad|respuesta|noticia|noticias)\b/,
  /\bno me han (?:respondido|contestado|llamado|escrito|enviado|dado)\b/,
  /\bsigo esperando\b/,
  /\bsiguen? sin (?:responder|contestar|llegar|llegarme|enviar|enviarme|dar)\b/,
  /\bcuando me (?:responden|contestan|contactan|van a responder|dan|solucionan|envian)\b/,
  /\bya (?:revisaron|respondieron|resolvieron|solucionaron|enviaron)\b/,
  /\b(?:que|como) (?:paso|va|sigue) con (?:mi|el|la|lo)\b/,
  /\ben que va\b/,
];

/**
 * Detecta mensajes de seguimiento / insistencia tras una PQR.
 *
 * Solo se consulta cuando el cliente YA tiene una PQR abierta, pero eso no
 * basta: tener un caso abierto no convierte todo lo que escriba durante los
 * siguientes 14 días en una pregunta sobre ese caso.
 */
export function looksLikePqrFollowUp(text: string): boolean {
  const t = normalizarTexto(text);
  return PQR_FOLLOW_UP_PATTERNS.some((re) => re.test(t));
}

export function normalizePhoneForPqr(value: string): string {
  return value.replace(/^whatsapp:/i, "").replace(/\D/g, "").slice(-10);
}

/**
 * Teléfono del cliente a partir del contacto de la conversación
 * ("whatsapp:+573001234567" → "+573001234567").
 *
 * Es lo que permite que `getRecentOpenByPhone` vuelva a encontrar la PQR cuando
 * el cliente manda su correo suelto: una PQR guardada sin teléfono es
 * inalcanzable para el interceptor, y su acuse ("lo sumo a tu ticket") queda en
 * promesa incumplible.
 */
export function pqrPhoneFromContactId(
  contactId: string | null | undefined
): string | undefined {
  const raw = (contactId ?? "")
    .replace(/^whatsapp:/i, "")
    .trim()
    .replace(/\s/g, "");
  return raw || undefined;
}
