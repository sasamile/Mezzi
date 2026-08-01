import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Tests de CABLEADO: leen el fuente en vez de ejecutarlo.
 *
 * Sin un entorno de Convex no se pueden invocar mutations ni actions, y hay
 * fallos que no viven dentro de ninguna función pura sino en cómo se conectan
 * entre sí: una acción de envío que deja de exigir sesión, un flag que nadie
 * lee, un interceptor que se cuelga del `if` equivocado. Todos ellos dejaban la
 * suite entera en verde.
 *
 * Son tests deliberadamente tontos y de una sola cosa: si fallan por un
 * renombrado, se arreglan en diez segundos; si fallan porque alguien deshizo el
 * cableado, acaban de evitar el fallo que los motivó.
 */

function fuente(ruta: string): string {
  return readFileSync(new URL(ruta, import.meta.url), "utf-8");
}

const YCLOUD_PUBLICO = fuente("../convex/ycloud.ts");
const CONVERSATIONS_SYS = fuente("../convex/system/conversations.ts");
const YCLOUD_SYS = fuente("../convex/system/ycloud.ts");
const SIDE_EFFECTS = fuente("../convex/system/agent/openclawSideEffects.ts");
const CREATE_PQR = fuente("../convex/system/ai/tools/createPQR.ts");

/** Cuerpo de un `export const <nombre> = ...` hasta el siguiente export. */
function bloqueExportado(src: string, nombre: string): string {
  const inicio = src.indexOf(`export const ${nombre} =`);
  expect(inicio, `no existe "export const ${nombre}"`).toBeGreaterThan(-1);
  const siguiente = src.indexOf("\nexport const ", inicio + 1);
  return src.slice(inicio, siguiente === -1 ? undefined : siguiente);
}

// ─── 1. Escribirle al cliente exige sesión ────────────────────────────────────
//
// El agujero: cualquiera con un `conversationId` podía escribirle a los
// clientes de otro restaurante desde el número de WhatsApp de ese restaurante.

describe("acciones de envío del panel — nadie escribe sin sesión", () => {
  /** Toda action pública de este módulo acaba mandando algo por WhatsApp. */
  const ACCIONES_PUBLICAS = [
    "sendWhatsAppMessage",
    "sendWhatsAppMedia",
    "retryBotResponse",
  ];

  it("no hay ninguna action pública más que las conocidas", () => {
    const encontradas = [
      ...YCLOUD_PUBLICO.matchAll(/export const (\w+) = action\(\{/g),
    ].map((m) => m[1]);
    expect(encontradas.sort()).toEqual([...ACCIONES_PUBLICAS].sort());
  });

  it.each(ACCIONES_PUBLICAS)("%s exige token y valida el acceso", (nombre) => {
    const bloque = bloqueExportado(YCLOUD_PUBLICO, nombre);
    expect(bloque, `${nombre} sin argumento token`).toContain("token: v.string()");
    expect(
      bloque,
      `${nombre} no pasa por requireAgentSendAccess`
    ).toContain("internal.system.conversations.requireAgentSendAccess");
  });

  /**
   * Validar y luego enviar igual no valida nada. El guard tiene que correr
   * ANTES del envío y su excepción tiene que salir: si alguien lo envuelve en
   * un `try`, la action vuelve a estar abierta a cualquiera.
   */
  it.each(ACCIONES_PUBLICAS)(
    "%s valida ANTES de enviar y no se traga el error",
    (nombre) => {
      const bloque = bloqueExportado(YCLOUD_PUBLICO, nombre);
      const posGuard = bloque.indexOf("requireAgentSendAccess");
      const posEnvio = bloque.search(
        /ctx\.runAction\(|processInboundMessageBatched/
      );
      expect(posGuard, `${nombre} no llama al guard`).toBeGreaterThan(-1);
      expect(posEnvio, `${nombre} no envía nada`).toBeGreaterThan(-1);
      expect(posEnvio, `${nombre} envía antes de validar`).toBeGreaterThan(
        posGuard
      );
      expect(bloque, `${nombre} envuelve el guard en un try`).not.toMatch(
        /\btry\s*\{/
      );
    }
  );

  it.each(["sendWhatsAppMessageInternal", "sendWhatsAppMediaInternal"])(
    "%s sigue siendo interna (el bot la usa, el mundo no)",
    (nombre) => {
      expect(bloqueExportado(YCLOUD_PUBLICO, nombre)).toContain(
        `export const ${nombre} = internalAction({`
      );
    }
  );

  /**
   * El endurecimiento no puede haber roto al bot: él no tiene sesión ni token,
   * así que su único camino es la acción interna.
   */
  it("el bot sigue teniendo su vía: entra por la acción interna", () => {
    expect(YCLOUD_SYS).toMatch(/internal\.ycloud\.sendWhatsAppMessageInternal/);
    expect(SIDE_EFFECTS).toMatch(/internal\.ycloud\.sendWhatsAppMediaInternal/);
  });

  it("y ningún módulo del backend entra por la pública (no tendría token)", () => {
    for (const [nombre, src] of [
      ["system/ycloud.ts", YCLOUD_SYS],
      ["openclawSideEffects.ts", SIDE_EFFECTS],
      ["createPQR.ts", CREATE_PQR],
      ["system/conversations.ts", CONVERSATIONS_SYS],
    ] as const) {
      expect(src, `${nombre} usa la action pública`).not.toMatch(
        /api\.ycloud\.(sendWhatsApp|retryBotResponse)/
      );
    }
  });

  it("el guard valida la sesión CONTRA EL TENANT REAL de la conversación", () => {
    const guard = bloqueExportado(CONVERSATIONS_SYS, "requireAgentSendAccess");
    // Él mismo tiene que ser interno: si fuera público, sería un oráculo de
    // sesiones válidas para cualquier conversación.
    expect(guard).toContain(
      "export const requireAgentSendAccess = internalMutation({"
    );
    // Sin `requireConversationAccess` no hay sesión que valga.
    expect(guard).toContain("requireConversationAccess");
    // Y sin este cruce, un tenant podría escribir en el chat de otro pasando su
    // propio tenantId en los args.
    expect(guard).toMatch(/conversation\.tenantId !== args\.tenantId/);
    expect(guard).toMatch(/throw new ConvexError/);
  });
});

// ─── 2. El side effect de OpenClaw y el mensaje del modelo ────────────────────

describe("ramal OpenClaw — el modelo no promete lo que el side effect desmiente", () => {
  /** Campos declarados en `OpenClawSideEffectResult`. */
  const CAMPOS_RESULTADO = (() => {
    const bloque = SIDE_EFFECTS.match(
      /export type OpenClawSideEffectResult = \{([\s\S]*?)\n\};/
    );
    expect(bloque, "no se encontró OpenClawSideEffectResult").not.toBeNull();
    return [...bloque![1].matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);
  })();

  it("declara los campos que se esperan", () => {
    expect(CAMPOS_RESULTADO).toContain("assistantMessageOverride");
  });

  /**
   * El fallo original: `toolSentWhatsApp` se asignaba en tres sitios y NO se
   * leía en ninguno, así que en `escalate_to_human` el cliente recibía el
   * mensaje honesto Y, pegado, el del modelo prometiéndole un asesor humano.
   */
  it.each(CAMPOS_RESULTADO)(
    "alguien lee el campo %s del resultado (si no, es un flag muerto)",
    (campo) => {
      expect(YCLOUD_SYS).toMatch(new RegExp(`fx\\.${campo}\\b`));
    }
  );

  it("el texto del modelo se sustituye ANTES de enviarlo", () => {
    const desdeElSideEffect = YCLOUD_SYS.slice(
      YCLOUD_SYS.indexOf("const fx = await applyOpenClawSideEffect(")
    );
    const posOverride = desdeElSideEffect.indexOf("fx.assistantMessageOverride");
    const posEnvio = desdeElSideEffect.indexOf("content: toSend");
    expect(posOverride).toBeGreaterThan(-1);
    expect(posEnvio).toBeGreaterThan(posOverride);
  });

  it("escalate_to_human sin agentes NO manda su propio WhatsApp", () => {
    const caso = SIDE_EFFECTS.slice(
      SIDE_EFFECTS.indexOf('case "escalate_to_human"'),
      SIDE_EFFECTS.indexOf('case "mark_resolved"')
    );
    const emailOnly = caso.slice(
      caso.indexOf("isEmailOnlySupportTenant(tenant)"),
      caso.indexOf("internal.system.conversations.escalate")
    );
    expect(emailOnly).toContain("assistantMessageOverride");
    // Si además enviara por su cuenta, volverían las dos burbujas.
    expect(emailOnly).not.toContain("sendWhatsAppMessageInternal");
  });
});

// ─── 3. La promesa "lo sumo a tu ticket" tiene que poder cumplirse ────────────

describe("interceptor del correo suelto — vale para todos los tenants con PQR", () => {
  const GATE = 'if (hasPqr && args.channel === "whatsapp") {';

  it("el bloque no está limitado al modo email-only", () => {
    expect(YCLOUD_SYS).toContain(GATE);
    const hastaElEnganche = YCLOUD_SYS.slice(
      YCLOUD_SYS.indexOf(GATE),
      YCLOUD_SYS.indexOf("internal.pqrs.attachCustomerEmail")
    );
    // `pqrConfirmationMessage` le pide el correo al cliente en TODOS los
    // tenants; si este enganche vuelve a exigir email-only, la promesa queda
    // incumplible fuera de Al Carbón y el correo se pierde.
    expect(hastaElEnganche).not.toContain("emailOnlySupport");
  });

  it("la respuesta de insistencia sí sigue siendo solo del modo email-only", () => {
    expect(YCLOUD_SYS).toContain(
      "emailOnlySupport && recentPqr && looksLikePqrFollowUp(clientText)"
    );
  });

  it("los dos interceptores dejan el turno en el hilo del agente", () => {
    const bloque = YCLOUD_SYS.slice(
      YCLOUD_SYS.indexOf(GATE),
      YCLOUD_SYS.indexOf("const enabledList")
    );
    // Sin esto, el modelo arranca el siguiente turno con un historial que no
    // coincide con lo que el cliente tiene delante.
    expect([...bloque.matchAll(/await guardarTurnoEnElHilo\(/g)]).toHaveLength(2);
  });
});

describe("createPQRTool — la PQR nace con teléfono", () => {
  it("completa el teléfono con el contacto de la conversación", () => {
    expect(CREATE_PQR).toContain(
      "pqrPhoneFromContactId(conversation.externalContactId)"
    );
  });

  it("y ese teléfono es el que se guarda", () => {
    const creacion = CREATE_PQR.slice(
      CREATE_PQR.indexOf("await ctx.runMutation(api.pqrs.create, {"),
      CREATE_PQR.indexOf("// Obtener el ticket number generado")
    );
    expect(creacion).toMatch(/^\s*customerPhone,$/m);
  });
});
