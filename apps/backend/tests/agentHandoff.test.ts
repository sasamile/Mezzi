import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import {
  AGENT_INACTIVITY_MS,
  agentInactivityRemainingMs,
  applyHandoffDecision,
  decideAgentActivity,
  decideAutoReleaseJob,
  decideOnAssignment,
  decideOnCustomerMessage,
  decideOnStatusChange,
  handoffPatch,
  type HandoffConversationState,
  type HandoffDecision,
} from "../convex/lib/agentHandoff";
import type { Id } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";

/**
 * Máquina de estados del traspaso agente humano ↔ bot.
 *
 * El bug que blindan estos tests es "la conversación muerta": un chat que se
 * queda asignado a un agente que ya no está, sin temporizador que lo devuelva
 * al bot. Nadie lo atiende —el bot no contesta porque hay un humano asignado, y
 * el humano no existe— y el cliente escribe al vacío indefinidamente.
 *
 * Los casos que más se vigilan aquí son los cuatro que producían ese estado:
 * cerrar un chat asignado, tomar el control de uno cerrado, un job viejo que
 * libera un chat que sí se está atendiendo, y liberar reabriendo un chat que el
 * agente había cerrado a propósito.
 */

const AGENTE = "agente_ana";
const OTRO_AGENTE = "agente_beto";
const MINUTO = 60 * 1000;

/**
 * El reloj simulado arranca en una fecha real, no en 0.
 *
 * No es cosmético: `agentLastActivityAt` ausente equivale a "actividad en el
 * epoch", y es justo esa distancia enorme la que hace que un chat asignado sin
 * marca de actividad (el backlog anterior al auto-retorno) se libere en cuanto
 * el cliente vuelve a escribir. Con el reloj en 0 ese rescate no se notaría.
 */
const INICIO = Date.UTC(2026, 0, 15, 9, 0, 0);

// ─── Convex simulado ──────────────────────────────────────────────────────────
//
// `applyHandoffDecision` es la ÚNICA capa que escribe el estado del handoff, y
// no se puede ejecutar sin un `ctx`. Esto es ese `ctx` reducido a lo que la
// función usa: la fila, el scheduler y nada más. Todo lo que hay debajo —los
// escenarios de la bandeja incluidos— pasa por aquí, así que no existe ninguna
// reimplementación del algoritmo real en este archivo.

const ID_CONVERSACION = "conv_1" as Id<"conversations">;
const JOB_AUTO_RELEASE = "system/conversations:autoReleaseToBot";
const JOB_BOT = "system/ycloud:scheduleDebounced";

function filaConversacion(
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    _id: ID_CONVERSACION,
    tenantId: "tenant_1",
    threadId: "thread_1",
    externalContactId: "whatsapp:+573001112233",
    customerName: "Cliente",
    channel: "whatsapp",
    status: "open",
    ...extra,
  };
}

type Programado = {
  jobId: string;
  nombre: string;
  enMs: number;
  disparaEn: number;
  args: Record<string, unknown>;
};

/** `ctx` de Convex reducido a lo que usa `applyHandoffDecision`. */
class ConvexSimulado {
  /** Traza ordenada: el ORDEN es parte del contrato, no un detalle. */
  traza: string[] = [];
  /** Jobs que el scheduler considera vivos (los demás hacen fallar `cancel`). */
  jobsVivos = new Set<string>();
  /** Todo lo que se programó, con nombre real de la función referenciada. */
  programados: Programado[] = [];
  private seq = 0;

  constructor(public fila: Record<string, unknown> | null) {}

  db = {
    get: async (_id: Id<"conversations">) => this.fila,
    patch: async (_id: Id<"conversations">, patch: Record<string, unknown>) => {
      this.traza.push(`patch(${Object.keys(patch).sort().join("+")})`);
      for (const [campo, valor] of Object.entries(patch)) {
        if (valor === undefined) delete this.fila![campo];
        else this.fila![campo] = valor;
      }
    },
  };

  scheduler = {
    cancel: async (jobId: string) => {
      this.traza.push(`cancel(${jobId})`);
      // Igual que Convex: cancelar un job ya consumido revienta.
      if (!this.jobsVivos.delete(jobId)) {
        throw new Error(`el job ${jobId} ya corrió o no existe`);
      }
    },
    runAfter: async (
      enMs: number,
      fn: unknown,
      args: Record<string, unknown>
    ) => {
      const nombre = getFunctionName(fn as never);
      const jobId = `job_${++this.seq}`;
      this.traza.push(`runAfter(${nombre})`);
      this.programados.push({
        jobId,
        nombre,
        enMs,
        disparaEn: Date.now() + enMs,
        args,
      });
      this.jobsVivos.add(jobId);
      return jobId;
    },
  };

  /** El mismo objeto, con la forma que espera `applyHandoffDecision`. */
  get ctx(): MutationCtx {
    return this as unknown as MutationCtx;
  }
}

// ─── Simulador de la bandeja ──────────────────────────────────────────────────
//
// Reproduce el ciclo completo (decidir → aplicar) sin Convex. La decisión son
// las funciones reales (`decide*`) y la escritura es `applyHandoffDecision`, la
// MISMA que corre en producción: lo único simulado es el reloj, el scheduler y
// la tabla.
//
// Antes esta clase copiaba a mano el cuerpo de `applyHandoffDecision` (cancelar
// → programar → `handoffPatch`), así que la capa que de verdad escribe no se
// ejecutaba en ningún test y tres regresiones dejaban la suite entera en verde:
// programar antes de cancelar (dos temporizadores por chat), borrar el
// `ctx.db.patch` (ninguna decisión se persiste) y tocar el guard de `threadId`
// (el turno pendiente del cliente se pierde en silencio).

type JobSimulado = { id: string; disparaEn: number; vivo: boolean };

class Bandeja {
  ahora = INICIO;
  convex = new ConvexSimulado(filaConversacion());

  /**
   * Estado del handoff. Es la fila de verdad —la que lee y escribe
   * `applyHandoffDecision`—, no una copia: si la función real dejara de
   * persistir algo, aquí se vería.
   */
  get chat(): HandoffConversationState {
    return this.convex.fila as HandoffConversationState;
  }
  set chat(estado: HandoffConversationState) {
    this.convex.fila = filaConversacion(estado as Record<string, unknown>);
  }

  /** Temporizadores de auto-retorno programados alguna vez, vivos o no. */
  get jobs(): JobSimulado[] {
    return this.convex.programados
      .filter((p) => p.nombre === JOB_AUTO_RELEASE)
      .map((p) => ({
        id: p.jobId,
        disparaEn: p.disparaEn,
        vivo: this.convex.jobsVivos.has(p.jobId),
      }));
  }

  /**
   * Cuántas veces se le pasó al bot el turno pendiente del cliente.
   *
   * Se cuentan los `scheduleDebounced` REALES que programó
   * `applyHandoffDecision`, no las decisiones que dijeron querer hacerlo: un
   * chat sin `threadId` no tiene a dónde mandar el turno y aquí eso se nota.
   */
  get botReanudado(): number {
    return this.convex.programados.filter((p) => p.nombre === JOB_BOT).length;
  }

  /**
   * Aplica la decisión con la función de producción y comprueba la invariante.
   *
   * La invariante se comprueba SIEMPRE, también cuando la decisión es "nada".
   * Saltársela ahí dejaba fuera del blindaje justo la única decisión capaz de
   * crear el estado muerto: "no hacer nada" sobre un chat que acaba de quedarse
   * abierto, asignado y sin temporizador.
   */
  private async aplicar(decision: HandoffDecision): Promise<HandoffDecision> {
    await applyHandoffDecision(this.convex.ctx, ID_CONVERSACION, decision);
    this.verificarInvariante();
    return decision;
  }

  /**
   * INVARIANTE del sistema: un chat en manos de un humano y abierto SIEMPRE
   * tiene temporizador. Se comprueba tras cada transición, así que cualquier
   * camino nuevo que deje el estado muerto rompe todos los escenarios, no solo
   * el que lo prueba explícitamente.
   */
  verificarInvariante(): void {
    if (this.chat.assignedTo && this.chat.status !== "closed") {
      expect(
        this.temporizadorVivo,
        "chat asignado y abierto sin temporizador: estado muerto"
      ).not.toBeNull();
    }
  }

  get temporizadorVivo(): JobSimulado | null {
    const id = this.chat.autoReleaseJobId;
    if (!id) return null;
    return this.jobs.find((j) => j.id === id && j.vivo) ?? null;
  }

  get enModoBot(): boolean {
    return !this.chat.assignedTo;
  }

  avanzar(ms: number): void {
    this.ahora += ms;
  }

  // ── Eventos que puede recibir un chat ──

  /**
   * Alguien asigna el chat (o lo suelta con `null`).
   *
   * Mismo orden que `conversations.updateAssignedTo`: la mutation escribe el
   * campo y DESPUÉS decide sobre el doc previo.
   */
  async asignar(userId: string | null): Promise<HandoffDecision> {
    const previo = { ...this.chat };
    if (userId) this.convex.fila!.assignedTo = userId;
    else delete this.convex.fila!.assignedTo;
    return this.aplicar(decideOnAssignment(previo, { userId }));
  }

  /** El agente cambia el estado desde la bandeja. */
  async cambiarEstado(status: string, actorId?: string): Promise<HandoffDecision> {
    const previo = { ...this.chat };
    this.convex.fila!.status = status;
    return this.aplicar(
      decideOnStatusChange(previo, { status, actorId, now: this.ahora })
    );
  }

  /** El agente escribe al cliente o toca la prioridad del chat. */
  async interactuaAgente(actorId?: string): Promise<HandoffDecision> {
    return this.aplicar(
      decideAgentActivity(this.chat, { actorId, now: this.ahora })
    );
  }

  /** Llega un mensaje del cliente: red de seguridad. */
  async mensajeDelCliente(): Promise<HandoffDecision> {
    return this.aplicar(decideOnCustomerMessage(this.chat, this.ahora));
  }

  /**
   * Dispara un temporizador. Por defecto el vigente; `jobId` permite disparar
   * uno viejo que no se alcanzó a cancelar (la carrera real).
   */
  async disparaTemporizador(jobId?: string): Promise<HandoffDecision> {
    const job = jobId
      ? this.jobs.find((j) => j.id === jobId)
      : this.temporizadorVivo;
    if (!job) throw new Error("no hay temporizador que disparar");
    this.ahora = Math.max(this.ahora, job.disparaEn);
    this.convex.jobsVivos.delete(job.id);
    return this.aplicar(decideAutoReleaseJob(this.chat, this.ahora));
  }
}

let bandeja: Bandeja;
beforeEach(() => {
  bandeja = new Bandeja();
  bandeja.chat = { status: "open" };
  // `applyHandoffDecision` sella `updatedAt` y `agentLastActivityAt` con
  // `Date.now()`: sin esto, el reloj simulado y el que escribe la función real
  // serían dos relojes distintos.
  vi.spyOn(Date, "now").mockImplementation(() => bandeja.ahora);
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Los cinco escenarios que producían la conversación muerta ────────────────

describe("cerrar un chat asignado", () => {
  it("no lo deja en el estado muerto: el siguiente mensaje del cliente lo rescata", async () => {
    await bandeja.asignar(AGENTE);
    await bandeja.cambiarEstado("closed", AGENTE);

    // Mientras está cerrado es legítimo no tener temporizador: nadie espera
    // respuesta. Pero sigue asignado, así que el bot no contestaría.
    expect(bandeja.chat.assignedTo).toBe(AGENTE);
    expect(bandeja.temporizadorVivo).toBeNull();

    // El cliente vuelve semanas después. Sin la red de seguridad, aquí moría.
    bandeja.avanzar(30 * 24 * 60 * MINUTO);
    await bandeja.mensajeDelCliente();

    expect(bandeja.enModoBot).toBe(true);
  });

  it("cerrar apaga el temporizador en vez de dejar un job huérfano", async () => {
    await bandeja.asignar(AGENTE);
    const job = bandeja.temporizadorVivo;
    expect(job).not.toBeNull();

    await bandeja.cambiarEstado("closed", AGENTE);
    expect(bandeja.jobs.find((j) => j.id === job!.id)!.vivo).toBe(false);
    expect(bandeja.chat.autoReleaseJobId).toBeUndefined();
  });

  it("cerrar NO borra el asignado: el dashboard distingue por ese campo quién resolvió", async () => {
    await bandeja.asignar(AGENTE);
    await bandeja.cambiarEstado("closed", AGENTE);
    expect(bandeja.chat.assignedTo).toBe(AGENTE);
  });
});

describe("tomar el control de un chat cerrado", () => {
  it("lo reabre y arranca el temporizador", async () => {
    bandeja.chat = { status: "closed" };

    const decision = await bandeja.asignar(AGENTE);

    expect(decision).toMatchObject({ accion: "programar", reabrirChat: true });
    expect(bandeja.chat.status).toBe("open");
    expect(bandeja.temporizadorVivo).not.toBeNull();
  });

  it("un chat abierto se asigna sin tocar el estado", async () => {
    await bandeja.asignar(AGENTE);
    expect(bandeja.chat.status).toBe("open");
    expect(bandeja.temporizadorVivo).not.toBeNull();
  });

  it("asignar registra la actividad para que el reloj arranque ahora, no en cero", async () => {
    bandeja.avanzar(5 * MINUTO);
    await bandeja.asignar(AGENTE);
    expect(bandeja.chat.agentLastActivityAt).toBe(bandeja.ahora);
  });

  it("soltar el control devuelve al bot y cancela el temporizador", async () => {
    await bandeja.asignar(AGENTE);
    const job = bandeja.temporizadorVivo!;

    await bandeja.asignar(null);

    expect(bandeja.enModoBot).toBe(true);
    expect(bandeja.jobs.find((j) => j.id === job.id)!.vivo).toBe(false);
    expect(bandeja.chat.autoReleaseJobId).toBeUndefined();
  });
});

describe("un job viejo no libera un chat que se está atendiendo", () => {
  it("si el agente interactuó después, el job reprograma en vez de liberar", async () => {
    await bandeja.asignar(AGENTE);
    const jobViejo = bandeja.temporizadorVivo!.id;

    // El agente contesta al minuto 9: se reprograma y el job viejo debería
    // haberse cancelado… pero simulamos que se disparó igual (la carrera real).
    bandeja.avanzar(9 * MINUTO);
    await bandeja.interactuaAgente(AGENTE);

    const decision = await bandeja.disparaTemporizador(jobViejo);

    expect(decision).toMatchObject({
      accion: "programar",
      motivo: "agente-interactuo-despues",
    });
    expect(bandeja.chat.assignedTo).toBe(AGENTE);
  });

  it("al reprogramar no regala la ventana entera: solo el tiempo que faltaba", async () => {
    await bandeja.asignar(AGENTE);
    const jobViejo = bandeja.temporizadorVivo!.id;

    bandeja.avanzar(9 * MINUTO);
    await bandeja.interactuaAgente(AGENTE);
    const decision = await bandeja.disparaTemporizador(jobViejo);

    if (decision.accion !== "programar") throw new Error("debía reprogramar");
    // El job viejo salta en t=10min y la actividad fue en t=9min: falta 9min.
    expect(decision.enMs).toBe(9 * MINUTO);
    expect(decision.marcarActividad).toBe(false);
  });

  it("el job que reprograma no cuenta como actividad del agente", async () => {
    await bandeja.asignar(AGENTE);
    const jobViejo = bandeja.temporizadorVivo!.id;
    bandeja.avanzar(9 * MINUTO);
    await bandeja.interactuaAgente(AGENTE);
    const actividad = bandeja.chat.agentLastActivityAt;

    await bandeja.disparaTemporizador(jobViejo);

    // Si el job refrescara el reloj, el chat nunca volvería al bot.
    expect(bandeja.chat.agentLastActivityAt).toBe(actividad);
  });

  it("tras reprogramar, el chat sí vuelve al bot cuando se agota el tiempo real", async () => {
    await bandeja.asignar(AGENTE);
    const jobViejo = bandeja.temporizadorVivo!.id;
    bandeja.avanzar(9 * MINUTO);
    await bandeja.interactuaAgente(AGENTE);
    await bandeja.disparaTemporizador(jobViejo);

    await bandeja.disparaTemporizador();

    expect(bandeja.enModoBot).toBe(true);
  });
});

describe("liberar no reabre un chat que el agente cerró a propósito", () => {
  it("un chat cerrado se libera sin reabrirse ni despertar al bot", async () => {
    await bandeja.asignar(AGENTE);
    const job = bandeja.temporizadorVivo!.id;
    // El agente cierra (esto cancela el temporizador), pero el job ya salió.
    await bandeja.cambiarEstado("closed", AGENTE);

    const decision = await bandeja.disparaTemporizador(job);

    expect(decision).toMatchObject({
      accion: "liberar",
      reabrirChat: false,
      reanudarBot: false,
    });
    expect(bandeja.chat.status).toBe("closed");
    expect(bandeja.botReanudado).toBe(0);
    expect(bandeja.enModoBot).toBe(true);
  });

  it("un chat abierto sí se reabre y le pasa al bot el turno pendiente", async () => {
    await bandeja.asignar(AGENTE);

    const decision = await bandeja.disparaTemporizador();

    expect(decision).toMatchObject({
      accion: "liberar",
      reabrirChat: true,
      reanudarBot: true,
    });
    expect(bandeja.botReanudado).toBe(1);
    expect(bandeja.enModoBot).toBe(true);
  });

  it("liberar borra el rastro del agente para que el reloj no herede nada", async () => {
    await bandeja.asignar(AGENTE);
    await bandeja.disparaTemporizador();

    expect(bandeja.chat.assignedTo).toBeUndefined();
    expect(bandeja.chat.agentLastActivityAt).toBeUndefined();
    expect(bandeja.chat.autoReleaseJobId).toBeUndefined();
  });
});

describe("reprogramación en cada interacción del agente", () => {
  it("cada respuesta del agente reinicia la ventana completa", async () => {
    await bandeja.asignar(AGENTE);

    for (let i = 0; i < 5; i++) {
      bandeja.avanzar(9 * MINUTO);
      await bandeja.interactuaAgente(AGENTE);
      expect(bandeja.chat.agentLastActivityAt).toBe(bandeja.ahora);
      expect(bandeja.temporizadorVivo!.disparaEn).toBe(
        bandeja.ahora + AGENT_INACTIVITY_MS
      );
    }

    // 45 minutos de conversación viva y el chat sigue siendo del agente.
    expect(bandeja.chat.assignedTo).toBe(AGENTE);
  });

  it("cada reprogramación cancela la anterior: nunca hay dos temporizadores vivos", async () => {
    await bandeja.asignar(AGENTE);
    for (let i = 0; i < 5; i++) {
      bandeja.avanzar(MINUTO);
      await bandeja.interactuaAgente(AGENTE);
      expect(bandeja.jobs.filter((j) => j.vivo)).toHaveLength(1);
    }
  });

  it("en cuanto el agente deja de interactuar, el chat vuelve al bot", async () => {
    await bandeja.asignar(AGENTE);
    bandeja.avanzar(9 * MINUTO);
    await bandeja.interactuaAgente(AGENTE);

    await bandeja.disparaTemporizador();

    expect(bandeja.enModoBot).toBe(true);
  });

  it("cambiar el estado a algo distinto de cerrado también cuenta como interacción", async () => {
    await bandeja.asignar(AGENTE);
    bandeja.avanzar(9 * MINUTO);

    await bandeja.cambiarEstado("pending", AGENTE);

    expect(bandeja.chat.agentLastActivityAt).toBe(bandeja.ahora);
  });
});

// ─── Quién puede reiniciar el reloj ───────────────────────────────────────────

describe("solo el agente asignado reinicia su reloj", () => {
  it("el triaje de un tercero no mantiene vivo un chat abandonado", async () => {
    await bandeja.asignar(AGENTE);
    const actividad = bandeja.chat.agentLastActivityAt;

    bandeja.avanzar(9 * MINUTO);
    const decision = await bandeja.interactuaAgente(OTRO_AGENTE);

    expect(decision).toMatchObject({ accion: "nada", motivo: "actor-ajeno" });
    expect(bandeja.chat.agentLastActivityAt).toBe(actividad);
  });

  it("por más veces que pase un tercero, el chat termina volviendo al bot", async () => {
    await bandeja.asignar(AGENTE);
    for (let i = 0; i < 10; i++) {
      bandeja.avanzar(MINUTO);
      await bandeja.interactuaAgente(OTRO_AGENTE);
    }

    await bandeja.disparaTemporizador();

    expect(bandeja.enModoBot).toBe(true);
  });

  /**
   * El agujero que quedaba abierto: `requireConversationAccess` solo valida
   * membresía (lib/session.ts), así que CUALQUIER miembro del restaurante puede
   * cerrar y reabrir un chat ajeno desde el menú contextual de la bandeja.
   * Cerrar mata el temporizador de ANA sin mirar quién cierra, y al reabrir el
   * filtro de `actorId` decía "no hago nada" y dejaba el chat abierto, de ANA y
   * sin nada programado: nadie lo atiende nunca más.
   */
  it("un tercero que cierra y reabre un chat ajeno no lo deja muerto", async () => {
    await bandeja.asignar(AGENTE);
    bandeja.avanzar(2 * MINUTO);

    // BETO (otro miembro del tenant) lo resuelve desde la lista…
    await bandeja.cambiarEstado("closed", OTRO_AGENTE);
    expect(bandeja.temporizadorVivo).toBeNull(); // legítimo mientras esté cerrado

    // …y se arrepiente: "Reabrir".
    await bandeja.cambiarEstado("open", OTRO_AGENTE);

    // Sigue siendo de ANA (BETO no se lo queda), pero YA no puede quedarse sin
    // nada que lo devuelva al bot.
    expect(bandeja.chat.assignedTo).toBe(AGENTE);
    expect(bandeja.temporizadorVivo).not.toBeNull();

    await bandeja.disparaTemporizador();
    expect(bandeja.enModoBot).toBe(true);
  });

  it("al rescatarlo no le regala al ausente la ventana entera: solo lo que faltaba", async () => {
    await bandeja.asignar(AGENTE);
    bandeja.avanzar(4 * MINUTO);
    await bandeja.cambiarEstado("closed", OTRO_AGENTE);

    const decision = await bandeja.cambiarEstado("open", OTRO_AGENTE);

    expect(decision).toMatchObject({
      accion: "programar",
      motivo: "temporizador-perdido",
      marcarActividad: false,
    });
    if (decision.accion !== "programar") throw new Error("debía programar");
    expect(decision.enMs).toBe(AGENT_INACTIVITY_MS - 4 * MINUTO);
  });

  it("si al reabrirlo la ventana del ausente ya venció, vuelve al bot en el acto", async () => {
    await bandeja.asignar(AGENTE);
    await bandeja.cambiarEstado("closed", OTRO_AGENTE);
    bandeja.avanzar(AGENT_INACTIVITY_MS + MINUTO);

    const decision = await bandeja.cambiarEstado("open", OTRO_AGENTE);

    expect(decision).toMatchObject({ accion: "liberar", motivo: "agente-inactivo" });
    expect(bandeja.enModoBot).toBe(true);
    // Nadie más va a despertar al bot: el cliente pudo escribir mientras el
    // chat estaba secuestrado y ese turno sigue sin responder.
    expect(bandeja.botReanudado).toBe(1);
  });

  it("el rescate solo actúa si de verdad falta el temporizador", async () => {
    await bandeja.asignar(AGENTE);
    bandeja.avanzar(MINUTO);

    // Chat abierto, con temporizador vivo: un tercero no toca nada.
    const decision = await bandeja.cambiarEstado("pending", OTRO_AGENTE);

    expect(decision).toMatchObject({ accion: "nada", motivo: "actor-ajeno" });
  });

  it("sin actorId no se comprueba nada: escribirle al cliente es atención real", async () => {
    await bandeja.asignar(AGENTE);
    bandeja.avanzar(9 * MINUTO);

    await bandeja.interactuaAgente();

    expect(bandeja.chat.agentLastActivityAt).toBe(bandeja.ahora);
  });

  it("un mensaje del cliente NO reinicia el reloj (si no, secuestraría el chat)", async () => {
    await bandeja.asignar(AGENTE);
    const actividad = bandeja.chat.agentLastActivityAt;

    for (let i = 0; i < 8; i++) {
      bandeja.avanzar(MINUTO);
      await bandeja.mensajeDelCliente();
    }

    expect(bandeja.chat.agentLastActivityAt).toBe(actividad);
    await bandeja.disparaTemporizador();
    expect(bandeja.enModoBot).toBe(true);
  });
});

/**
 * La invariante es el blindaje de TODOS los escenarios de arriba: si alguna vez
 * dejara de detectar el estado muerto, cada uno de ellos seguiría en verde sin
 * probar nada. Esto comprueba que el detector detecta.
 */
describe("el chequeo de invariante no es decorativo", () => {
  it("un chat asignado, abierto y sin temporizador hace fallar la comprobación", () => {
    bandeja.chat = { status: "open", assignedTo: AGENTE };
    expect(() => bandeja.verificarInvariante()).toThrow(/estado muerto/);
  });

  it("con temporizador vivo no se queja", async () => {
    await bandeja.asignar(AGENTE);
    expect(() => bandeja.verificarInvariante()).not.toThrow();
  });

  it("cerrado y sin temporizador es legítimo: nadie espera respuesta", () => {
    bandeja.chat = { status: "closed", assignedTo: AGENTE };
    expect(() => bandeja.verificarInvariante()).not.toThrow();
  });

  it("un handle de job que ya no está vivo NO cuenta como temporizador", () => {
    bandeja.chat = {
      status: "open",
      assignedTo: AGENTE,
      autoReleaseJobId: "job_fantasma",
    };
    expect(() => bandeja.verificarInvariante()).toThrow(/estado muerto/);
  });
});

// ─── Red de seguridad del mensaje entrante ────────────────────────────────────

describe("reconciliación con cada mensaje del cliente", () => {
  it("libera en el acto si el agente ya se pasó de la ventana", async () => {
    // Asignado, con actividad reciente, pero sin temporizador vivo: el estado
    // muerto tal cual quedaba en la base antes de la corrección.
    bandeja.chat = {
      status: "open",
      assignedTo: AGENTE,
      agentLastActivityAt: bandeja.ahora,
      autoReleaseJobId: undefined,
    };
    bandeja.avanzar(AGENT_INACTIVITY_MS + MINUTO);

    const decision = await bandeja.mensajeDelCliente();

    expect(decision).toMatchObject({ accion: "liberar", motivo: "agente-inactivo" });
    expect(bandeja.enModoBot).toBe(true);
  });

  it("no despierta al bot por su cuenta: el propio mensaje entrante ya lo hará", async () => {
    bandeja.chat = {
      status: "open",
      assignedTo: AGENTE,
      agentLastActivityAt: bandeja.ahora,
    };
    bandeja.avanzar(AGENT_INACTIVITY_MS + MINUTO);

    await bandeja.mensajeDelCliente();

    expect(bandeja.botReanudado).toBe(0);
  });

  it("rescata el backlog anterior al auto-retorno: asignado y sin actividad registrada", async () => {
    // Chats que quedaron asignados antes de que existiera el temporizador: no
    // tienen `agentLastActivityAt` y nadie puede demostrar que el agente siga.
    // Se liberan al primer mensaje del cliente, sin esperar ninguna ventana.
    bandeja.chat = { status: "open", assignedTo: AGENTE };

    const decision = await bandeja.mensajeDelCliente();

    expect(decision).toMatchObject({ accion: "liberar", motivo: "agente-inactivo" });
    expect(bandeja.enModoBot).toBe(true);
  });

  it("rearma el temporizador perdido por el tiempo que falta, no por la ventana entera", async () => {
    bandeja.chat = {
      status: "open",
      assignedTo: AGENTE,
      agentLastActivityAt: bandeja.ahora,
    };
    bandeja.avanzar(4 * MINUTO);

    const decision = await bandeja.mensajeDelCliente();

    expect(decision).toMatchObject({
      accion: "programar",
      motivo: "temporizador-perdido",
      marcarActividad: false,
    });
    if (decision.accion !== "programar") throw new Error("debía programar");
    expect(decision.enMs).toBe(AGENT_INACTIVITY_MS - 4 * MINUTO);
    expect(bandeja.chat.assignedTo).toBe(AGENTE);
  });

  it("no toca nada si el agente está dentro de la ventana y su temporizador vive", async () => {
    await bandeja.asignar(AGENTE);
    const job = bandeja.temporizadorVivo!.id;

    bandeja.avanzar(MINUTO);
    const decision = await bandeja.mensajeDelCliente();

    expect(decision).toMatchObject({ accion: "nada", motivo: "temporizador-vivo" });
    expect(bandeja.temporizadorVivo!.id).toBe(job);
  });

  it("no toca nada si el chat ya está en modo bot", async () => {
    const decision = await bandeja.mensajeDelCliente();
    expect(decision).toMatchObject({ accion: "nada", motivo: "ya-en-modo-bot" });
  });
});

// ─── Ciclos completos: la invariante se comprueba en cada paso ────────────────

describe("ciclos completos de una conversación", () => {
  it("bot → agente → cierre → cliente vuelve → bot", async () => {
    await bandeja.asignar(AGENTE);
    bandeja.avanzar(2 * MINUTO);
    await bandeja.interactuaAgente(AGENTE);
    await bandeja.cambiarEstado("closed", AGENTE);

    bandeja.avanzar(3 * 24 * 60 * MINUTO);
    await bandeja.mensajeDelCliente();

    expect(bandeja.enModoBot).toBe(true);
    expect(bandeja.jobs.filter((j) => j.vivo)).toHaveLength(0);
  });

  it("cerrar y reasignar deja el chat abierto, con dueño y con temporizador", async () => {
    await bandeja.asignar(AGENTE);
    await bandeja.cambiarEstado("closed", AGENTE);
    bandeja.avanzar(MINUTO);
    await bandeja.asignar(OTRO_AGENTE);

    expect(bandeja.chat.status).toBe("open");
    expect(bandeja.chat.assignedTo).toBe(OTRO_AGENTE);
    expect(bandeja.temporizadorVivo).not.toBeNull();
  });

  it("traspaso entre agentes: el reloj se reinicia para el nuevo dueño", async () => {
    await bandeja.asignar(AGENTE);
    bandeja.avanzar(9 * MINUTO);
    await bandeja.asignar(OTRO_AGENTE);

    expect(bandeja.chat.agentLastActivityAt).toBe(bandeja.ahora);
    expect(bandeja.temporizadorVivo!.disparaEn).toBe(
      bandeja.ahora + AGENT_INACTIVITY_MS
    );
    expect(bandeja.jobs.filter((j) => j.vivo)).toHaveLength(1);
  });

  it("un chat abandonado acaba siempre en modo bot, se haga lo que se haga con él", async () => {
    await bandeja.asignar(AGENTE);
    bandeja.avanzar(3 * MINUTO);
    await bandeja.mensajeDelCliente();
    bandeja.avanzar(3 * MINUTO);
    await bandeja.interactuaAgente(OTRO_AGENTE);
    bandeja.avanzar(3 * MINUTO);
    await bandeja.mensajeDelCliente();

    await bandeja.disparaTemporizador();

    expect(bandeja.enModoBot).toBe(true);
    expect(bandeja.jobs.filter((j) => j.vivo)).toHaveLength(0);
  });
});

// ─── Funciones puras, casos borde ─────────────────────────────────────────────

describe("decisiones sobre una conversación inexistente", () => {
  it.each([
    ["decideAgentActivity", () => decideAgentActivity(null)],
    ["decideOnAssignment", () => decideOnAssignment(null, { userId: AGENTE })],
    [
      "decideOnStatusChange",
      () => decideOnStatusChange(undefined, { status: "open" }),
    ],
    ["decideOnCustomerMessage", () => decideOnCustomerMessage(null, 0)],
    ["decideAutoReleaseJob", () => decideAutoReleaseJob(undefined, 0)],
  ])("%s no hace nada", (_nombre, fn) => {
    expect(fn()).toEqual({ accion: "nada", motivo: "sin-conversacion" });
  });
});

describe("decisiones sobre un chat que ya está en modo bot", () => {
  it("la actividad de un agente sobre un chat sin dueño no programa nada", () => {
    expect(decideAgentActivity({ status: "open" })).toMatchObject({
      accion: "nada",
      motivo: "sin-agente-asignado",
    });
  });

  it("si arrastraba un job, se cancela en vez de dejarlo huérfano", () => {
    expect(
      decideAgentActivity({ status: "open", autoReleaseJobId: "job_1" })
    ).toMatchObject({ accion: "cancelar", motivo: "sin-agente-asignado" });
  });

  it("el temporizador que salta sobre un chat ya liberado solo limpia su handle", () => {
    expect(
      decideAutoReleaseJob({ status: "open", autoReleaseJobId: "job_1" }, 0)
    ).toMatchObject({ accion: "cancelar", motivo: "ya-en-modo-bot" });
  });
});

/**
 * El guard de `actor-ajeno` es el que producía el estado muerto: devolvía
 * "nada" sin mirar si el chat se había quedado sin temporizador. Estos casos lo
 * fijan en las dos direcciones, sin pasar por la bandeja.
 */
describe("decideAgentActivity — un tercero no reinicia el reloj pero tampoco mata el chat", () => {
  const AHORA = 1_000_000;

  it("abierto y SIN temporizador: rescata en vez de no hacer nada", () => {
    expect(
      decideAgentActivity(
        {
          status: "open",
          assignedTo: AGENTE,
          agentLastActivityAt: AHORA - 4 * MINUTO,
        },
        { actorId: OTRO_AGENTE, now: AHORA }
      )
    ).toMatchObject({
      accion: "programar",
      motivo: "temporizador-perdido",
      enMs: AGENT_INACTIVITY_MS - 4 * MINUTO,
      marcarActividad: false,
    });
  });

  it("abierto, sin temporizador y con la ventana vencida: lo devuelve al bot", () => {
    expect(
      decideAgentActivity(
        {
          status: "open",
          assignedTo: AGENTE,
          agentLastActivityAt: AHORA - AGENT_INACTIVITY_MS,
        },
        { actorId: OTRO_AGENTE, now: AHORA }
      )
    ).toMatchObject({
      accion: "liberar",
      motivo: "agente-inactivo",
      reanudarBot: true,
    });
  });

  it("con temporizador vivo sí se queda quieto: no le regala tiempo al ausente", () => {
    expect(
      decideAgentActivity(
        {
          status: "open",
          assignedTo: AGENTE,
          agentLastActivityAt: AHORA,
          autoReleaseJobId: "job_1",
        },
        { actorId: OTRO_AGENTE, now: AHORA }
      )
    ).toEqual({ accion: "nada", motivo: "actor-ajeno" });
  });

  it("cerrado y sin temporizador se queda quieto: ahí es legítimo", () => {
    expect(
      decideAgentActivity(
        { status: "closed", assignedTo: AGENTE, agentLastActivityAt: AHORA },
        { actorId: OTRO_AGENTE, now: AHORA }
      )
    ).toEqual({ accion: "nada", motivo: "actor-ajeno" });
  });
});

describe("agentInactivityRemainingMs", () => {
  it("cuenta desde la última actividad del agente", () => {
    expect(
      agentInactivityRemainingMs({ agentLastActivityAt: 1000 }, 1000 + 4 * MINUTO)
    ).toBe(AGENT_INACTIVITY_MS - 4 * MINUTO);
  });

  it("sin actividad registrada el tiempo ya está agotado", () => {
    expect(agentInactivityRemainingMs({}, AGENT_INACTIVITY_MS)).toBe(0);
    expect(agentInactivityRemainingMs({}, AGENT_INACTIVITY_MS + 1)).toBeLessThan(0);
  });

  it("justo en el límite el chat se libera (no se queda colgado un ciclo más)", () => {
    const chat = { assignedTo: AGENTE, agentLastActivityAt: 0 };
    expect(decideAutoReleaseJob(chat, AGENT_INACTIVITY_MS)).toMatchObject({
      accion: "liberar",
    });
  });
});

describe("handoffPatch — qué escribe cada decisión", () => {
  it("no escribe nada cuando no hay nada que hacer", () => {
    expect(
      handoffPatch({ accion: "nada", motivo: "ya-en-modo-bot" }, { now: 1 })
    ).toBeNull();
  });

  it("cancelar sin job pendiente no toca la fila", () => {
    expect(
      handoffPatch(
        { accion: "cancelar", motivo: "chat-cerrado" },
        { now: 1, jobPrevio: null }
      )
    ).toBeNull();
  });

  it("programar sin marcar actividad no pisa el reloj del agente", () => {
    const patch = handoffPatch(
      {
        accion: "programar",
        enMs: MINUTO,
        marcarActividad: false,
        reabrirChat: false,
        motivo: "temporizador-perdido",
      },
      { now: 5000, nuevoJobId: "job_9" }
    );
    expect(patch).not.toBeNull();
    expect(patch).not.toHaveProperty("agentLastActivityAt");
    expect(patch!.autoReleaseJobId).toBe("job_9");
  });

  it("liberar sin reabrir no mete un status en el patch", () => {
    const patch = handoffPatch(
      {
        accion: "liberar",
        reabrirChat: false,
        reanudarBot: false,
        motivo: "agente-inactivo",
      },
      { now: 5000 }
    );
    expect(patch).not.toHaveProperty("status");
    expect(patch!.assignedTo).toBeUndefined();
  });
});

// ─── La capa que escribe, aislada ─────────────────────────────────────────────
//
// Los escenarios de arriba ya pasan por `applyHandoffDecision`. Lo que sigue la
// somete a los casos que la bandeja no produce de forma natural: cancelar un
// job fantasma, una conversación borrada entre medias, un chat sin `threadId`.

function aplicarDeVerdad(
  convex: ConvexSimulado,
  decision: HandoffDecision
): Promise<void> {
  return applyHandoffDecision(convex.ctx, ID_CONVERSACION, decision);
}

const PROGRAMAR: HandoffDecision = {
  accion: "programar",
  enMs: AGENT_INACTIVITY_MS,
  marcarActividad: true,
  reabrirChat: false,
  motivo: "actividad-del-agente",
};

describe("applyHandoffDecision — el reemplazo del temporizador es atómico", () => {
  it("cancela el job anterior ANTES de crear el nuevo", async () => {
    const convex = new ConvexSimulado(
      filaConversacion({ assignedTo: AGENTE, autoReleaseJobId: "job_viejo" })
    );
    convex.jobsVivos.add("job_viejo");

    await aplicarDeVerdad(convex, PROGRAMAR);

    expect(convex.traza).toEqual([
      "cancel(job_viejo)",
      `runAfter(${JOB_AUTO_RELEASE})`,
      "patch(agentLastActivityAt+autoReleaseJobId+updatedAt)",
    ]);
    // Un solo temporizador vivo para el chat: el nuevo.
    expect(convex.jobsVivos.size).toBe(1);
  });

  it("deja el handle del job nuevo escrito en la fila", async () => {
    const convex = new ConvexSimulado(filaConversacion({ assignedTo: AGENTE }));

    await aplicarDeVerdad(convex, PROGRAMAR);

    expect(convex.fila!.autoReleaseJobId).toBe("job_1");
    expect(typeof convex.fila!.agentLastActivityAt).toBe("number");
    expect(convex.programados[0]).toMatchObject({
      nombre: JOB_AUTO_RELEASE,
      enMs: AGENT_INACTIVITY_MS,
      args: { conversationId: ID_CONVERSACION },
    });
  });

  it("reabrir el chat se persiste junto con el temporizador", async () => {
    const convex = new ConvexSimulado(
      filaConversacion({ assignedTo: AGENTE, status: "closed" })
    );

    await aplicarDeVerdad(convex, {
      accion: "programar",
      enMs: AGENT_INACTIVITY_MS,
      marcarActividad: true,
      reabrirChat: true,
      motivo: "agente-toma-control",
    });

    expect(convex.fila!.status).toBe("open");
    expect(convex.fila!.autoReleaseJobId).toBe("job_1");
  });

  it("un job que ya se consumió no rompe la mutation", async () => {
    const convex = new ConvexSimulado(
      filaConversacion({ assignedTo: AGENTE, autoReleaseJobId: "job_fantasma" })
    );
    // `jobsVivos` vacío: el cancel lanza, como en Convex.

    await expect(aplicarDeVerdad(convex, PROGRAMAR)).resolves.toBeUndefined();
    expect(convex.fila!.autoReleaseJobId).toBe("job_1");
  });
});

describe("applyHandoffDecision — liberar devuelve el chat y atiende al cliente", () => {
  it("borra dueño y reloj de la fila", async () => {
    const convex = new ConvexSimulado(
      filaConversacion({
        assignedTo: AGENTE,
        agentLastActivityAt: 1,
        autoReleaseJobId: "job_viejo",
      })
    );
    convex.jobsVivos.add("job_viejo");

    await aplicarDeVerdad(convex, {
      accion: "liberar",
      reabrirChat: true,
      reanudarBot: true,
      motivo: "agente-inactivo",
    });

    expect(convex.fila).not.toHaveProperty("assignedTo");
    expect(convex.fila).not.toHaveProperty("autoReleaseJobId");
    expect(convex.fila).not.toHaveProperty("agentLastActivityAt");
    expect(convex.fila!.status).toBe("open");
    expect(convex.jobsVivos.has("job_viejo")).toBe(false);
  });

  it("le pasa al bot el turno pendiente con los datos de la conversación", async () => {
    const convex = new ConvexSimulado(filaConversacion({ assignedTo: AGENTE }));

    await aplicarDeVerdad(convex, {
      accion: "liberar",
      reabrirChat: true,
      reanudarBot: true,
      motivo: "agente-inactivo",
    });

    const bot = convex.programados.find((p) => p.nombre === JOB_BOT);
    expect(bot, "no se despertó al bot").toBeDefined();
    expect(bot!.args).toMatchObject({
      conversationId: ID_CONVERSACION,
      tenantId: "tenant_1",
      threadId: "thread_1",
      contactId: "whatsapp:+573001112233",
      channel: "whatsapp",
    });
  });

  it("no despierta al bot cuando la decisión dice que no", async () => {
    const convex = new ConvexSimulado(filaConversacion({ assignedTo: AGENTE }));

    await aplicarDeVerdad(convex, {
      accion: "liberar",
      reabrirChat: false,
      reanudarBot: false,
      motivo: "agente-inactivo",
    });

    expect(convex.programados).toHaveLength(0);
  });

  it("sin threadId no hay a dónde mandar el turno: se libera igual, sin bot", async () => {
    const convex = new ConvexSimulado(
      filaConversacion({ assignedTo: AGENTE, threadId: undefined })
    );

    await aplicarDeVerdad(convex, {
      accion: "liberar",
      reabrirChat: true,
      reanudarBot: true,
      motivo: "agente-inactivo",
    });

    expect(convex.programados).toHaveLength(0);
    expect(convex.fila).not.toHaveProperty("assignedTo");
  });
});

describe("applyHandoffDecision — casos en los que no debe tocar nada", () => {
  it("la decisión 'nada' no escribe ni programa", async () => {
    const convex = new ConvexSimulado(
      filaConversacion({ assignedTo: AGENTE, autoReleaseJobId: "job_viejo" })
    );
    convex.jobsVivos.add("job_viejo");

    await aplicarDeVerdad(convex, { accion: "nada", motivo: "temporizador-vivo" });

    expect(convex.traza).toEqual([]);
    expect(convex.jobsVivos.has("job_viejo")).toBe(true);
  });

  it("cancelar sin job pendiente no toca la fila", async () => {
    const convex = new ConvexSimulado(filaConversacion());

    await aplicarDeVerdad(convex, { accion: "cancelar", motivo: "chat-cerrado" });

    expect(convex.traza).toEqual([]);
  });

  it("cancelar con job pendiente lo apaga y suelta el handle", async () => {
    const convex = new ConvexSimulado(
      filaConversacion({ assignedTo: AGENTE, autoReleaseJobId: "job_viejo" })
    );
    convex.jobsVivos.add("job_viejo");

    await aplicarDeVerdad(convex, { accion: "cancelar", motivo: "chat-cerrado" });

    expect(convex.traza).toEqual([
      "cancel(job_viejo)",
      "patch(autoReleaseJobId+updatedAt)",
    ]);
    expect(convex.fila).not.toHaveProperty("autoReleaseJobId");
    // Cerrar NO borra el asignado: el dashboard distingue por ese campo.
    expect(convex.fila!.assignedTo).toBe(AGENTE);
  });

  it("una conversación borrada entre medias no produce escrituras", async () => {
    const convex = new ConvexSimulado(null);

    await aplicarDeVerdad(convex, PROGRAMAR);

    expect(convex.traza).toEqual([]);
    expect(convex.programados).toEqual([]);
  });
});
