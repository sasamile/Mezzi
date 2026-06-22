/**
 * OpenClaw `/v1/responses`: un solo turno devuelve mensaje para WhatsApp + efecto opcional en Convex.
 * Sin OpenAI en este camino (cuando OPENCLAW_AUTH_TOKEN está definido en ycloud).
 *
 * Env:
 *   OPENCLAW_GATEWAY_URL
 *   OPENCLAW_AUTH_TOKEN
 *   OPENCLAW_RESPONSES_MODEL (default openclaw:main)
 *   OPENCLAW_REQUEST_TIMEOUT_MS (default 25000)
 *   OPENCLAW_TENANT_PROMPT_MAX_CHARS (default 120000) — prompt del restaurante casi completo
 *   OPENCLAW_RAG_MAX_CHARS (default 48000)
 *   OPENCLAW_DIALOG_HINT_MAX_CHARS (default 8000) — último mensaje del bot + contexto diálogo
 */

export type RestaurantTurnInput = {
  clientMessage: string;
  restaurantName: string;
  tenantId: string;
  modulesLine: string;
  tenantPromptExcerpt: string;
  ragKnowledgeExcerpt: string;
  pdfsLine: string;
  dateTimeLine: string;
  customerLine: string;
  lastBotMessage?: string;
  lastQuestionContext: string;
  imageUrl?: string;
  imageContextLine?: string;
  /** Resultado de búsqueda de vacantes en Convex (segunda pasada al gateway) */
  vacancyLookupFromConvex?: string;
  /** true = el modelo solo redacta usando vacancyLookup; side_effect debe ser null salvo PDF/reserva */
  vacancyRefinementPass?: boolean;
  /** Resultado de búsqueda de productos URBRANDS/WooCommerce (segunda pasada) */
  productLookupFromConvex?: string;
  /** true = redactar usando productLookupFromConvex */
  productRefinementPass?: boolean;
};

export type OpenClawTurnResult = {
  assistant_message: string;
  side_effect?: {
    kind: string;
    args?: Record<string, unknown>;
  } | null;
};

/** Recorta por el final (p. ej. RAG); marca truncado. */
export function truncateForOpenClaw(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n…[truncado]";
}

/**
 * Si el prompt supera el máximo, conserva inicio + final (los flujos suelen estar
 * repartidos: reglas al inicio, FAQ/cierre al final).
 */
export function truncateHeadTailForOpenClaw(text: string, maxChars: number): string {
  if (text.length <= maxChars || maxChars < 400) return text;
  const reserve = 120;
  const usable = maxChars - reserve;
  const headLen = Math.ceil(usable * 0.55);
  const tailLen = usable - headLen;
  return (
    text.slice(0, headLen) +
    `\n…[··· omitidos ${text.length - headLen - tailLen} caracteres del medio ···]\n` +
    text.slice(-tailLen)
  );
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function openClawMaxTenantPromptChars(): number {
  return envInt("OPENCLAW_TENANT_PROMPT_MAX_CHARS", 120_000, 8_000, 500_000);
}

export function openClawMaxRagChars(): number {
  return envInt("OPENCLAW_RAG_MAX_CHARS", 48_000, 2_000, 200_000);
}

export function openClawMaxDialogHintChars(): number {
  return envInt("OPENCLAW_DIALOG_HINT_MAX_CHARS", 8_000, 500, 80_000);
}

function extractTextFromResponsesBody(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const b = body as Record<string, unknown>;

  if (typeof b.output_text === "string" && b.output_text.trim()) {
    return b.output_text.trim();
  }

  const tryOutput = (out: unknown): string => {
    if (!Array.isArray(out)) return "";
    const parts: string[] = [];
    for (const item of out) {
      if (typeof item !== "object" || !item) continue;
      const o = item as Record<string, unknown>;
      if (o.type === "message" && Array.isArray(o.content)) {
        for (const c of o.content) {
          if (typeof c !== "object" || !c) continue;
          const c0 = c as Record<string, unknown>;
          if (c0.type === "output_text" && typeof c0.text === "string") {
            parts.push(c0.text);
          } else if (typeof c0.text === "string") {
            parts.push(c0.text);
          }
        }
      } else if (typeof o.text === "string") {
        parts.push(o.text);
      }
    }
    return parts.join("\n").trim();
  };

  const nested = tryOutput(b.output);
  if (nested) return nested;

  const resp = b.response;
  if (typeof resp === "object" && resp !== null) {
    const r = resp as Record<string, unknown>;
    if (typeof r.output_text === "string" && r.output_text.trim()) {
      return r.output_text.trim();
    }
    const fromR = tryOutput(r.output);
    if (fromR) return fromR;
  }

  const choices = b.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const c0 = choices[0] as Record<string, unknown>;
    const msg = c0.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === "string") return msg.content.trim();
  }

  if (typeof b.text === "string") return b.text.trim();
  return "";
}

function stripMarkdownFence(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im;
  const m = s.match(fence);
  if (m?.[1]) s = m[1].trim();
  return s;
}

export function parseTurnFromOrchestratorText(
  text: string
): OpenClawTurnResult | null {
  const cleaned = stripMarkdownFence(text);
  try {
    const o = JSON.parse(cleaned) as OpenClawTurnResult;
    if (o && typeof o.assistant_message === "string" && o.assistant_message.trim()) {
      return {
        assistant_message: o.assistant_message.trim(),
        side_effect: o.side_effect ?? null,
      };
    }
  } catch {
    // sigue
  }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const o = JSON.parse(cleaned.slice(start, end + 1)) as OpenClawTurnResult;
      if (o && typeof o.assistant_message === "string" && o.assistant_message.trim()) {
        return {
          assistant_message: o.assistant_message.trim(),
          side_effect: o.side_effect ?? null,
        };
      }
    } catch {
      return null;
    }
  }
  return null;
}

function buildTurnOutputContract(refinement: boolean): string {
  const base = `Responde ÚNICAMENTE con un JSON válido (sin markdown, sin texto extra). Esquema obligatorio:
{
  "assistant_message": "mensaje en español para WhatsApp, tono amable y profesional del restaurante",
  "side_effect": null | {
    "kind": "<ver lista abajo>",
    "args": { }
  }
}
Kinds válidos de side_effect:
  "create_reservation"     — crear reserva (args: customerName?, date YYYY-MM-DD, time 24h, numberOfPeople|partySize, customerPhone?, tableNumber?, notes?)
  "send_document_pdf"      — enviar PDF (args: label = label exacto de "pdfs")
  "escalate_to_human"      — pasar a agente humano (args: {}). NO usar si modules indica soporte solo por correo.
  "mark_resolved"          — cerrar conversación (args: {})
  "search_job_vacancies"   — buscar vacantes (args: city? o cityFilter?)
  "search_products"        — buscar productos URBRANDS en WooCommerce. Args: search (texto libre) O por separado marca (ej "LV"), categoria (ej "sandalias"), talla (ej "39"). IMPORTANTE: siempre emitir este side_effect antes de decir que NO hay stock.
  "create_pqr"             — registrar PQR: Petición, Queja, Reclamo, Sugerencia o Felicitación
                             args OBLIGATORIOS: type (petition|complaint|claim|suggestion|compliment), subject (>5 chars), description (>10 chars)
                             args opcionales: customerName, customerEmail, customerPhone, customerCity (ciudad/sede), module (calidad_alimentos|limpieza|facturacion|domicilios|sugerencias|infraestructura|trabaja_nosotros|proveedores)
  "set_priority"           — cambiar prioridad de la conversación (args: priority = "high"|"medium"|"low")
  "create_order"           — registrar pedido (args: items, notes?, customerName?, customerPhone?)
  "cancel_order"           — cancelar último pedido pendiente (args: {})
  "update_order"           — modificar último pedido (args: notes)
  "cancel_reservation"     — cancelar reserva activa (args: {})
  "update_reservation"     — modificar reserva activa (args: date?, time?, numberOfPeople?, tableNumber?, notes?)

Reglas globales:
- "restaurantPrompt" es el MANUAL OPERATIVO del restaurante. Tiene PRIORIDAD ABSOLUTA sobre respuestas genéricas. Sigue sus flujos, tonos y pasos al pie de la letra.
- assistant_message: siempre presente. Mensajes cortos, una pregunta por turno si el manual lo pide.
- No inventes sedes, cargos ni precios: usa knowledgeBase (RAG).
- SEDES/UBICACIONES: el campo "knowledgeBase" YA contiene toda la información de sedes, ciudades y barrios. Si el cliente menciona una ciudad (ej. Villavicencio, Bogotá, Medellín, Barranquilla), BUSCA en todo el texto de knowledgeBase antes de decir que no tienes datos. La información puede estar en cualquier sección (ubicaciones_completo, LOCALES, BARRIOS). NUNCA digas "no tengo esa información" si el knowledgeBase contiene datos de esa ciudad.
- PQRS: cuando el manual diga "llama a createPQRTool" o el cliente haya dado tipo + asunto + descripción, emite side_effect create_pqr. NO sigas preguntando si ya tienes los 3 datos. BUSCA en todo el dialogHint (historial): si el cliente ya describió su queja/problema en un turno anterior, usa esa descripción como "description" y genera un "subject" resumido. El "type" se infiere del contexto (queja sobre comida/atención = complaint; sugerencia = suggestion; etc.). El "subject" es un resumen breve (~10 palabras). La "description" es lo que contó el cliente. NUNCA pidas al cliente que repita lo que ya dijo. SIEMPRE incluye "module" según el flujo del manual (calidad_alimentos, limpieza, facturacion, domicilios, sugerencias, infraestructura, trabaja_nosotros, proveedores) y "customerCity" si el cliente indicó sede/ciudad.
- Reservas: solo con datos completos (nombre, fecha, hora, personas).
- CONTEXTO DE CONVERSACIÓN: dialogHint contiene el historial reciente de la conversación completa. Lee TODO el historial antes de responder. Si el cliente ya proporcionó cualquier dato (nombre, email, sede, descripción de queja, barrio, ciudad, etc.) en turnos anteriores, úsalo directamente. NUNCA vuelvas a pedir información que el cliente ya dio en el historial. Esto es CRÍTICO para el flujo de PQRS: si el cliente ya describió su problema, usa esa descripción para crear el ticket inmediatamente.
${refinement ? "- PASADA DE REFINADO: ya recibiste vacancyLookupFromConvex o productLookupFromConvex. Redacta usando SOLO esa lista. side_effect null salvo PDF/reserva/escalar/cerrar.\n" : ""}`;
  return base;
}

/**
 * Un solo POST a /v1/responses: pensamiento + redacción en OpenClaw.
 */
export async function restaurantTurnWithOpenClaw(
  input: RestaurantTurnInput
): Promise<OpenClawTurnResult | null> {
  const gatewayUrl =
    process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:18789";
  const authToken = process.env.OPENCLAW_AUTH_TOKEN;
  const model =
    process.env.OPENCLAW_RESPONSES_MODEL ?? "openclaw:main";
  const timeoutMs = Math.min(
    Math.max(
      parseInt(process.env.OPENCLAW_REQUEST_TIMEOUT_MS ?? "25000", 10) || 25000,
      5000
    ),
    120000
  );

  if (!authToken) return null;

  const refinement = Boolean(
    input.vacancyRefinementPass || input.productRefinementPass
  );
  const payload = {
    role: "restaurant_whatsapp_turn",
    outputContract: buildTurnOutputContract(refinement),
    restaurant: input.restaurantName,
    tenantId: input.tenantId,
    modules: input.modulesLine,
    dateTime: input.dateTimeLine,
    customer: input.customerLine,
    restaurantPrompt: input.tenantPromptExcerpt,
    knowledgeBase: input.ragKnowledgeExcerpt,
    pdfs: input.pdfsLine,
    lastBotMessage: input.lastBotMessage ?? "",
    dialogHint: input.lastQuestionContext,
    clientMessage: input.clientMessage,
    ...(input.vacancyLookupFromConvex?.trim()
      ? {
          vacancyLookupFromConvex: input.vacancyLookupFromConvex.trim(),
        }
      : {}),
    ...(input.productLookupFromConvex?.trim()
      ? {
          productLookupFromConvex: input.productLookupFromConvex.trim(),
        }
      : {}),
    imageNote:
      input.imageUrl?.trim() ||
      (input.imageContextLine?.trim()
        ? "El cliente envió una imagen (sin URL en payload)."
        : ""),
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/v1/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: JSON.stringify(payload),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn("openclawPlanner: /v1/responses HTTP error", {
        status: res.status,
      });
      return null;
    }

    const body = (await res.json()) as unknown;
    const assistantText = extractTextFromResponsesBody(body);
    if (!assistantText) {
      console.warn("openclawPlanner: respuesta sin texto");
      return null;
    }

    const turn = parseTurnFromOrchestratorText(assistantText);
    if (!turn) {
      console.warn("openclawPlanner: JSON de turno inválido", {
        preview: assistantText.slice(0, 240),
      });
      return null;
    }

    console.log("openclawPlanner: turno OK", {
      len: turn.assistant_message.length,
      side: turn.side_effect?.kind ?? null,
    });
    return turn;
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    console.warn(
      isAbort
        ? `openclawPlanner: timeout (>${timeoutMs}ms) /v1/responses`
        : "openclawPlanner: error de red /v1/responses",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
