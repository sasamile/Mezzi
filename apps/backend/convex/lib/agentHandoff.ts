import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Tiempo que una conversación puede quedarse asignada a un agente humano sin
 * ninguna interacción suya antes de volver sola al bot. Ajustar aquí.
 */
export const AGENT_INACTIVITY_MS = 10 * 60 * 1000; // 10 minutos

// ─── Núcleo puro: la máquina de estados del handoff ────────────────────────────
//
// Toda la lógica de "qué hay que hacer" vive en funciones puras que reciben el
// estado de la conversación y devuelven una decisión. Las mutations son capa
// fina: leen, deciden con estas funciones y aplican con `applyHandoffDecision`.
//
// INVARIANTE que sostienen entre todas: una conversación NUNCA se queda
// asignada a un humano sin temporizador que la devuelva al bot… salvo mientras
// está cerrada (ahí no hay nadie esperando respuesta). En cuanto el cliente
// vuelve a escribir, `decideOnCustomerMessage` la libera o le rearma el
// temporizador, así que el estado muerto no sobrevive a un mensaje entrante.
//
// Ese rescate por mensaje entrante NO basta por sí solo: si el cliente ya
// escribió y se cansó de esperar, no habrá más mensajes que disparen nada. Por
// eso cada camino que puede dejar el chat abierto y en manos de un humano se
// asegura de que quede un temporizador (ver `rescatarChatSinTemporizador`).

/**
 * Lo único que la máquina de estados necesita saber de una conversación.
 *
 * Los ids van como `string` a propósito: así el núcleo es puro y testeable sin
 * Convex, y un `Doc<"conversations">` encaja tal cual.
 */
export type HandoffConversationState = {
  /** Agente humano dueño del chat. Ausente = modo bot. */
  assignedTo?: string | null;
  status?: string | null;
  /** Última interacción del agente. Ausente = nunca registró actividad. */
  agentLastActivityAt?: number | null;
  /** Handle del job de devolución ya programado. */
  autoReleaseJobId?: string | null;
};

/** Por qué se tomó la decisión. Sirve para que los tests lean como una frase. */
export type HandoffMotivo =
  | "sin-conversacion"
  | "actor-ajeno"
  | "sin-agente-asignado"
  | "ya-en-modo-bot"
  | "temporizador-vivo"
  | "temporizador-perdido"
  | "actividad-del-agente"
  | "agente-toma-control"
  | "chat-cerrado"
  | "agente-interactuo-despues"
  | "agente-inactivo";

export type HandoffDecision =
  /** No tocar nada. */
  | { accion: "nada"; motivo: HandoffMotivo }
  /** Cancelar el temporizador pendiente y soltar su handle. */
  | { accion: "cancelar"; motivo: HandoffMotivo }
  /** Cancelar el pendiente (si lo hay) y programar uno nuevo en `enMs`. */
  | {
      accion: "programar";
      enMs: number;
      /** ¿Cuenta como interacción del agente (reinicia el reloj)? */
      marcarActividad: boolean;
      /** ¿Hay que reabrir el chat porque estaba cerrado? */
      reabrirChat: boolean;
      motivo: HandoffMotivo;
    }
  /** Devolver el chat al bot. */
  | {
      accion: "liberar";
      /** Un chat que el agente cerró a propósito NO se reabre al liberarlo. */
      reabrirChat: boolean;
      /** ¿Se le pasa al bot el turno del cliente que quedó sin responder? */
      reanudarBot: boolean;
      motivo: HandoffMotivo;
    };

/** Milisegundos que le quedan al agente antes de perder el chat. */
export function agentInactivityRemainingMs(
  conv: HandoffConversationState,
  now: number
): number {
  return AGENT_INACTIVITY_MS - (now - (conv.agentLastActivityAt ?? 0));
}

/** Cancelar solo tiene sentido si hay algo programado. */
function cancelarSiHayJob(
  conv: HandoffConversationState,
  motivo: HandoffMotivo
): HandoffDecision {
  return conv.autoReleaseJobId
    ? { accion: "cancelar", motivo }
    : { accion: "nada", motivo };
}

/**
 * Un chat que se ha quedado en manos de un humano, abierto y SIN temporizador,
 * es el estado muerto: ni el bot contesta ni hay nada programado que lo suelte.
 *
 * Este es el rescate: si la ventana del agente ya pasó, se devuelve al bot; si
 * no, se rearma el temporizador por el tiempo que falte (nunca por la ventana
 * entera, que sería regalarle al agente ausente otros diez minutos).
 */
function rescatarChatSinTemporizador(
  conv: HandoffConversationState,
  now: number,
  reanudarBot: boolean
): HandoffDecision {
  const restante = agentInactivityRemainingMs(conv, now);
  if (restante <= 0) {
    return {
      accion: "liberar",
      reabrirChat: false,
      reanudarBot,
      motivo: "agente-inactivo",
    };
  }
  return {
    accion: "programar",
    enMs: restante,
    marcarActividad: false,
    reabrirChat: false,
    motivo: "temporizador-perdido",
  };
}

/**
 * El agente hizo algo sobre el chat (escribir al cliente, triarlo): se reinicia
 * el reloj completo.
 *
 * `actorId` existe para el triaje desde la lista: si cualquier miembro
 * reiniciara el reloj de un chat ajeno, bastaría con que alguien pasara por la
 * bandeja cada menos de AGENT_INACTIVITY_MS para que un chat abandonado no
 * volviera nunca al bot. Sin `actorId` no se comprueba nada (asignar o
 * escribirle al cliente sí es atención real sobre ese chat, la haga quien la
 * haga).
 */
export function decideAgentActivity(
  conv: HandoffConversationState | null | undefined,
  opts?: { actorId?: string | null; now?: number }
): HandoffDecision {
  if (!conv) return { accion: "nada", motivo: "sin-conversacion" };
  if (opts?.actorId && conv.assignedTo && conv.assignedTo !== opts.actorId) {
    // Un tercero no reinicia el reloj ajeno… pero tampoco puede dejar el chat
    // muerto. Si sigue asignado, abierto y sin temporizador (típico: alguien
    // reabre desde la bandeja un chat cerrado que era de otro agente), "no
    // hacer nada" significa que nadie va a atender a ese cliente nunca.
    if (conv.status !== "closed" && !conv.autoReleaseJobId) {
      return rescatarChatSinTemporizador(conv, opts.now ?? Date.now(), true);
    }
    return { accion: "nada", motivo: "actor-ajeno" };
  }
  // Sin agente asignado no hay control humano que devolver.
  if (!conv.assignedTo) return cancelarSiHayJob(conv, "sin-agente-asignado");

  return {
    accion: "programar",
    enMs: AGENT_INACTIVITY_MS,
    marcarActividad: true,
    reabrirChat: false,
    motivo: "actividad-del-agente",
  };
}

/**
 * Cambio de asignación desde la bandeja.
 *
 * Tomar el control REABRE el chat si estaba cerrado: dejarlo cerrado y asignado
 * es el peor estado posible —ni el bot lo atiende ni aparece en la bandeja
 * activa— y encima nadie volvería a tocarlo. Soltar el control cancela el
 * temporizador para no dejar jobs huérfanos.
 */
export function decideOnAssignment(
  conv: HandoffConversationState | null | undefined,
  opts: { userId: string | null }
): HandoffDecision {
  if (!conv) return { accion: "nada", motivo: "sin-conversacion" };
  if (!opts.userId) return cancelarSiHayJob(conv, "sin-agente-asignado");

  return {
    accion: "programar",
    enMs: AGENT_INACTIVITY_MS,
    marcarActividad: true,
    reabrirChat: conv.status === "closed",
    motivo: "agente-toma-control",
  };
}

/**
 * Cambio de estado desde la bandeja.
 *
 * Cerrar apaga el temporizador (no hay cliente esperando). Cualquier otro
 * cambio es interacción del agente y lo reinicia, sujeto al filtro de `actorId`.
 *
 * Al cerrar NO se toca `assignedTo`: el dashboard distingue por ese campo los
 * chats que resolvió el bot de los que resolvió una persona. El chat queda
 * asignado y sin temporizador, que es legítimo mientras siga cerrado; quien lo
 * rescata si el cliente vuelve es `decideOnCustomerMessage`.
 *
 * OJO con el estado que se le pasa a `decideAgentActivity`: se evalúa con el
 * status NUEVO, no con el de `conv`. Reabrir desde la bandeja un chat cerrado
 * de otro agente es justo el caso en que la conversación deja de estar cerrada
 * —y por tanto necesita temporizador— mientras `conv.status` todavía dice
 * "closed".
 */
export function decideOnStatusChange(
  conv: HandoffConversationState | null | undefined,
  opts: { status: string; actorId?: string | null; now?: number }
): HandoffDecision {
  if (!conv) return { accion: "nada", motivo: "sin-conversacion" };
  if (opts.status === "closed") return cancelarSiHayJob(conv, "chat-cerrado");
  return decideAgentActivity(
    { ...conv, status: opts.status },
    { actorId: opts.actorId, now: opts.now }
  );
}

/**
 * Red de seguridad que corre con CADA mensaje entrante del cliente.
 *
 * Todos los demás caminos nacen de una acción del agente sobre el chat; si el
 * agente desaparece, nada vuelve a tocarlo. Este es el único evento que sigue
 * ocurriendo sin él.
 *
 * OJO: un mensaje del CLIENTE no es actividad del AGENTE, así que esto nunca
 * reinicia el reloj. Si lo hiciera, un cliente insistente mantendría el chat
 * secuestrado en modo humano indefinidamente.
 */
export function decideOnCustomerMessage(
  conv: HandoffConversationState | null | undefined,
  now: number
): HandoffDecision {
  if (!conv) return { accion: "nada", motivo: "sin-conversacion" };
  if (!conv.assignedTo) return { accion: "nada", motivo: "ya-en-modo-bot" };

  // Sin `agentLastActivityAt` (chats asignados antes de existir el
  // auto-retorno) el restante sale negativo y se libera: es lo correcto, nadie
  // puede demostrar que ese agente siga ahí. Aquí sí se libera aunque el
  // temporizador siga vivo: el cliente está esperando ahora mismo.
  //
  // `reanudarBot: false` porque ese mismo mensaje entrante va a disparar al bot
  // por su camino normal, y reabrir es cosa de quien lo procesa (crea thread
  // nuevo); aquí solo se devuelve el control.
  if (agentInactivityRemainingMs(conv, now) <= 0) {
    return rescatarChatSinTemporizador(conv, now, false);
  }

  if (conv.autoReleaseJobId) return { accion: "nada", motivo: "temporizador-vivo" };

  // Sigue dentro de la ventana pero se quedó sin temporizador: rearmarlo por el
  // tiempo que falte, nunca por la ventana completa.
  return rescatarChatSinTemporizador(conv, now, false);
}

/**
 * Disparó el temporizador. Defensivo a propósito: un job viejo que no se
 * alcanzó a cancelar no debe soltar un chat que el agente sigue atendiendo.
 */
export function decideAutoReleaseJob(
  conv: HandoffConversationState | null | undefined,
  now: number
): HandoffDecision {
  if (!conv) return { accion: "nada", motivo: "sin-conversacion" };
  // Ya no está en manos de un humano: no hay nada que liberar, solo limpiar el
  // handle del job que acaba de consumirse.
  if (!conv.assignedTo) return cancelarSiHayJob(conv, "ya-en-modo-bot");

  const restante = agentInactivityRemainingMs(conv, now);
  if (restante > 0) {
    // El agente interactuó después de programarse este job. No basta con salir:
    // este job ya se consumió, así que hay que reprogramar el tiempo que falte
    // o el chat quedaría en modo humano sin temporizador.
    return {
      accion: "programar",
      enMs: restante,
      marcarActividad: false,
      reabrirChat: false,
      motivo: "agente-interactuo-despues",
    };
  }

  const cerrado = conv.status === "closed";
  return {
    accion: "liberar",
    // No reabrimos ni molestamos al bot en un chat que el agente cerró a
    // propósito: no hay nadie esperando respuesta.
    reabrirChat: !cerrado,
    reanudarBot: !cerrado,
    motivo: "agente-inactivo",
  };
}

// ─── Escritura: qué campos deja cada decisión ─────────────────────────────────

/**
 * Campos que una decisión escribe en la conversación.
 *
 * `JobId` es genérico para que el núcleo siga sin depender de Convex: en
 * producción se instancia con `Id<"_scheduled_functions">` y en los tests con
 * `string`.
 */
export type HandoffPatch<JobId = string> = {
  assignedTo?: undefined;
  autoReleaseJobId?: JobId | undefined;
  agentLastActivityAt?: number | undefined;
  status?: "open";
  updatedAt: number;
};

/**
 * Traduce una decisión al patch que hay que escribir. Puro a propósito: es la
 * única definición de "cómo queda la conversación", así que la simulación de
 * los tests y el camino real de Convex ejecutan exactamente el mismo código.
 *
 * Devuelve `null` cuando no hay nada que escribir (incluye cancelar sin job
 * pendiente: no hay por qué tocar `updatedAt` si no cambió nada).
 */
export function handoffPatch<JobId>(
  decision: HandoffDecision,
  opts: { now: number; jobPrevio?: JobId | null; nuevoJobId?: JobId | null }
): HandoffPatch<JobId> | null {
  if (decision.accion === "nada") return null;

  if (decision.accion === "cancelar") {
    if (!opts.jobPrevio) return null;
    return { autoReleaseJobId: undefined, updatedAt: opts.now };
  }

  if (decision.accion === "programar") {
    return {
      autoReleaseJobId: opts.nuevoJobId ?? undefined,
      updatedAt: opts.now,
      ...(decision.marcarActividad ? { agentLastActivityAt: opts.now } : {}),
      ...(decision.reabrirChat ? { status: "open" as const } : {}),
    };
  }

  // liberar: el chat vuelve al bot, sin dueño y sin reloj.
  return {
    assignedTo: undefined,
    autoReleaseJobId: undefined,
    agentLastActivityAt: undefined,
    ...(decision.reabrirChat ? { status: "open" as const } : {}),
    updatedAt: opts.now,
  };
}

// ─── Capa de aplicación ───────────────────────────────────────────────────────

async function cancelarJobPendiente(
  ctx: MutationCtx,
  jobId: Id<"_scheduled_functions"> | undefined
): Promise<void> {
  if (!jobId) return;
  try {
    await ctx.scheduler.cancel(jobId);
  } catch {
    // El job ya corrió o fue cancelado previamente; ignorar
  }
}

/**
 * Ejecuta una decisión sobre la conversación. Único sitio que escribe el
 * estado del handoff, para que no haya dos formas distintas de dejarlo.
 *
 * Programar cancela SIEMPRE el job anterior antes de crear el nuevo, dentro de
 * la misma mutation, para que el reemplazo sea atómico y no queden dos
 * temporizadores compitiendo.
 */
export async function applyHandoffDecision(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  decision: HandoffDecision
): Promise<void> {
  if (decision.accion === "nada") return;

  const conv = await ctx.db.get(conversationId);
  if (!conv) return;
  const now = Date.now();

  // Orden fijo: se apaga el temporizador viejo ANTES de crear el nuevo, dentro
  // de la misma mutation, para que el reemplazo sea atómico y nunca queden dos
  // jobs compitiendo por el mismo chat.
  const jobPrevio = conv.autoReleaseJobId;
  await cancelarJobPendiente(ctx, jobPrevio);

  const nuevoJobId =
    decision.accion === "programar"
      ? await ctx.scheduler.runAfter(
          decision.enMs,
          internal.system.conversations.autoReleaseToBot,
          { conversationId }
        )
      : null;

  const patch = handoffPatch<Id<"_scheduled_functions">>(decision, {
    now,
    jobPrevio,
    nuevoJobId,
  });
  if (patch) await ctx.db.patch(conversationId, patch);

  if (decision.accion !== "liberar") return;

  // Durante el modo humano, `processInboundMessage` guarda los mensajes del
  // cliente pero NO dispara al bot. Devolver el control sin atender ese turno
  // deja esperando justo al cliente para el que existe este auto-retorno.
  //
  // Se entra por `scheduleDebounced` a propósito: reemplaza el job pendiente en
  // vez de sumarse a él, y `processInboundMessageBatched` se cancela solo si el
  // chat volvió a manos de un humano, si está cerrado o si no hay INBOUND sin
  // responder (por ejemplo porque el agente sí contestó).
  if (decision.reanudarBot && conv.threadId) {
    await ctx.scheduler.runAfter(0, internal.system.ycloud.scheduleDebounced, {
      conversationId,
      tenantId: conv.tenantId,
      threadId: conv.threadId,
      contactId: conv.externalContactId,
      customerName: conv.customerName,
      channel: conv.channel,
    });
  }
}

// ─── Atajos que usan las mutations ────────────────────────────────────────────

/** Marca actividad del agente y (re)programa la devolución al bot. */
export async function scheduleAgentAutoRelease(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  opts?: { actorId?: Id<"users"> }
): Promise<void> {
  const conv = await ctx.db.get(conversationId);
  await applyHandoffDecision(ctx, conversationId, decideAgentActivity(conv, opts));
}

/** Reconciliación con cada mensaje entrante del cliente. */
export async function reconcileAgentAutoRelease(
  ctx: MutationCtx,
  conversationId: Id<"conversations">
): Promise<void> {
  const conv = await ctx.db.get(conversationId);
  await applyHandoffDecision(
    ctx,
    conversationId,
    decideOnCustomerMessage(conv, Date.now())
  );
}

/** Cuerpo del job `autoReleaseToBot`. */
export async function runAutoReleaseJob(
  ctx: MutationCtx,
  conversationId: Id<"conversations">
): Promise<void> {
  const conv = await ctx.db.get(conversationId);
  await applyHandoffDecision(
    ctx,
    conversationId,
    decideAutoReleaseJob(conv, Date.now())
  );
}
