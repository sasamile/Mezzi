import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  emailOnlySupportGatewayLine,
  emailOnlySupportPromptBlock,
  mergePqrAckSuffix,
  pqrAlreadyRegisteredMessage,
  pqrConfirmationMessage,
  pqrConfirmationSuffix,
  pqrEmailAttachedMessage,
  HUMAN_HANDOFF_UNAVAILABLE_MESSAGE,
  type PqrAckInput,
  type PqrType,
} from "../convex/system/alcarbon";

/**
 * Invariantes que debe cumplir TODO texto que el cliente recibe por WhatsApp.
 *
 * `pqrMessages.test.ts` prueba cada generador por dentro; aquí se prueban las
 * reglas que valen para todos a la vez, recorriendo la matriz completa
 * (generador × tipo de PQR × con/sin correo × módulo). Así, un generador nuevo
 * o una redacción nueva que rompa una de estas reglas falla aunque nadie se
 * acuerde de escribirle su test.
 *
 * Las tres reglas duras que se blindan:
 *   1. No prometer nada que el sistema no pueda cumplir (envíos a un correo que
 *      el cliente nunca dio).
 *   2. No disculparse ni pedir "ayúdanos a mejorar" ante una FELICITACIÓN.
 *   3. El acuse de escalamiento no puede afirmar que existe un registro: en ese
 *      punto todavía no se ha creado ninguna PQR.
 */

const TICKET = "998877";
const EMAIL = "cliente@ejemplo.com";

const TIPOS: PqrType[] = [
  "petition",
  "complaint",
  "claim",
  "suggestion",
  "compliment",
];

/** Tipos con algo pendiente que responder (todos menos la felicitación). */
const CON_PENDIENTE = TIPOS.filter((t) => t !== "compliment");

// ─── Detectores de intención ──────────────────────────────────────────────────
//
// Se busca la INTENCIÓN, no una frase literal, para que una reescritura del
// copy no rompa los tests pero sí lo haga un cambio de promesa.

/** Da por hecho que el cliente ya nos dio su correo. */
const DA_POR_HECHO_EL_CORREO =
  /(?:al|a tu|el)\s+correo\s+que\s+(?:nos\s+)?(?:indicaste|diste|dejaste)|a tu correo\b|al correo registrado|correo que tenemos/i;

/** Promete, en firme, que algo va a salir hacia el correo del cliente. */
const PROMETE_ENVIO = /\benviaremos\b|\brecibir[áa]s\b|\bte llegar[áa]\b|\bte enviar[eé]/i;

/** Le pide el correo al cliente en vez de darlo por sabido. */
const PIDE_CORREO =
  /resp[óo]ndeme con (?:el|tu) correo|con tu correo electr[óo]nico|dime a cu[áa]l|ind[íi]ca(?:me|nos) (?:el|tu) correo/i;

const MENCIONA_CORREO = /correo/i;
const SE_DISCULPA = /lamenta|sentimos mucho|una disculpa|disculpa[sn]? por|perd[óo]n/i;
const PIDE_AYUDA_PARA_MEJORAR = /ayudarnos a mejorar/i;
const AFIRMA_REGISTRO = /qued[óo] registrad|ya est[áa] registrad|registrado exitosamente/i;
const MENCIONA_TICKET = /ticket|#\d/i;

/** Los tres generadores que producen texto a partir de un `PqrAckInput`. */
const GENERADORES: Array<[string, (input: PqrAckInput) => string]> = [
  ["pqrConfirmationMessage", pqrConfirmationMessage],
  ["pqrConfirmationSuffix", pqrConfirmationSuffix],
  ["pqrAlreadyRegisteredMessage", pqrAlreadyRegisteredMessage],
];

/**
 * Generadores que solo existen CON correo del cliente.
 *
 * `pqrEmailAttachedMessage` se emite justo después de anotar el correo, así que
 * no tiene sentido en la matriz "sin correo" —su tipo ni siquiera lo permite—,
 * pero sí tiene que cumplir todas las reglas del resto: en particular, no
 * prometerle un envío a una FELICITACIÓN. `getRecentOpenByPhone` no filtra por
 * tipo, de modo que un correo suelto puede acabar enganchado a una felicitación
 * abierta y este texto es el que recibe el cliente.
 */
const GENERADORES_CON_CORREO: Array<
  [string, (input: PqrAckInput & { customerEmail: string }) => string]
> = [...GENERADORES, ["pqrEmailAttachedMessage", pqrEmailAttachedMessage]];

/**
 * ¿Existe de verdad el mecanismo que engancharía a este ticket el correo que el
 * cliente mande después? Solo con `true` puede un texto pedir el correo.
 */
const DISPONIBILIDAD = [true, false];

/**
 * Matriz completa: cada generador × cada tipo × cada módulo × con y sin
 * enganche de correo disponible.
 *
 * La disponibilidad entra en la matriz porque es una PROMESA más: pedirle el
 * correo al cliente cuando nadie lo va a leer es tan falso como prometerle un
 * envío a un correo que no dio.
 */
function casos(extra: Partial<PqrAckInput> = {}) {
  const filas: Array<{
    generador: string;
    type: PqrType;
    module?: string;
    emailFollowUpAvailable: boolean;
    etiqueta: string;
    texto: string;
  }> = [];
  for (const [generador, fn] of GENERADORES) {
    for (const type of TIPOS) {
      for (const module of [undefined, "facturacion", "facturación", "pedidos"]) {
        for (const emailFollowUpAvailable of DISPONIBILIDAD) {
          filas.push({
            generador,
            type,
            module,
            emailFollowUpAvailable,
            etiqueta: `${generador}/${type}/${module ?? "sin-módulo"}/${
              emailFollowUpAvailable ? "con-enganche" : "sin-enganche"
            }`,
            texto: fn({
              type,
              ticketNumber: TICKET,
              module,
              emailFollowUpAvailable,
              ...extra,
            }),
          });
        }
      }
    }
  }
  return filas;
}

// ─── 1. Nunca prometer un correo que no tenemos ───────────────────────────────

describe("sin correo del cliente, ningún texto promete un envío", () => {
  it("ninguno da por hecho que el cliente ya nos dio su correo", () => {
    const culpables = casos()
      .filter((c) => DA_POR_HECHO_EL_CORREO.test(c.texto))
      .map((c) => c.etiqueta);
    expect(culpables).toEqual([]);
  });

  it("ninguno promete en firme un envío ('enviaremos', 'recibirás')", () => {
    const culpables = casos()
      .filter((c) => PROMETE_ENVIO.test(c.texto))
      .map((c) => c.etiqueta);
    expect(culpables).toEqual([]);
  });

  it("si un texto habla de correo, es para pedirlo", () => {
    const culpables = casos()
      .filter((c) => MENCIONA_CORREO.test(c.texto) && !PIDE_CORREO.test(c.texto))
      .map((c) => c.etiqueta);
    expect(culpables).toEqual([]);
  });

  it("un correo en blanco o solo espacios cuenta como no tener correo", () => {
    for (const vacio of ["", "   ", "\n\t"]) {
      const msg = pqrConfirmationMessage({
        type: "complaint",
        ticketNumber: TICKET,
        customerEmail: vacio,
        emailFollowUpAvailable: true,
      });
      expect(msg).not.toMatch(DA_POR_HECHO_EL_CORREO);
      expect(msg).not.toMatch(PROMETE_ENVIO);
      expect(msg).toMatch(PIDE_CORREO);
    }
  });
});

// ─── 1 bis. Pedir el correo también es una promesa ────────────────────────────
//
// El interceptor que engancha un correo suelto a un ticket (system/ycloud.ts)
// solo corre en WhatsApp y solo reencuentra la PQR por teléfono. Fuera de ahí,
// "respóndeme con tu correo y lo sumo a tu ticket" manda al cliente a escribir
// a un buzón que nadie lee: el correo se pierde y él cree que quedó anotado.

describe("sin enganche de correo disponible, nadie le pide el correo al cliente", () => {
  const sinEnganche = () => casos().filter((c) => !c.emailFollowUpAvailable);

  it("ningún texto lo pide", () => {
    const culpables = sinEnganche()
      .filter((c) => PIDE_CORREO.test(c.texto))
      .map((c) => c.etiqueta);
    expect(culpables).toEqual([]);
  });

  it("ningún texto lo menciona siquiera", () => {
    const culpables = sinEnganche()
      .filter((c) => MENCIONA_CORREO.test(c.texto))
      .map((c) => c.etiqueta);
    expect(culpables).toEqual([]);
  });

  it("pero el cliente no se queda sin nada: sigue teniendo su ticket", () => {
    for (const c of sinEnganche()) {
      expect(c.texto, c.etiqueta).toContain(TICKET);
    }
  });

  it("y se le dice por dónde le responden, que es lo que sí es cierto", () => {
    for (const c of sinEnganche().filter((c) => c.type !== "compliment")) {
      expect(c.texto, c.etiqueta).toMatch(/este mismo canal/i);
    }
  });
});

describe("con enganche disponible y sin correo, sí se le pide", () => {
  it.each(CON_PENDIENTE)("a una %s se le pide el correo", (type) => {
    for (const [generador, fn] of GENERADORES) {
      const texto = fn({
        type,
        ticketNumber: TICKET,
        emailFollowUpAvailable: true,
      });
      expect(texto, `${generador} / ${type}`).toMatch(PIDE_CORREO);
    }
  });

  /**
   * El default tiene que ser el que NO promete: un generador nuevo que olvide
   * pasar el flag debe callar, no pedir un correo que nadie va a leer.
   */
  it("omitir el flag equivale a 'no disponible', no a 'disponible'", () => {
    for (const [generador, fn] of GENERADORES) {
      const texto = fn({ type: "complaint", ticketNumber: TICKET });
      expect(texto, `${generador} promete por omisión`).not.toMatch(PIDE_CORREO);
      expect(texto, `${generador} habla de correo por omisión`).not.toMatch(
        MENCIONA_CORREO
      );
    }
  });
});

describe("con correo del cliente, sí se le dice dónde va a recibir la respuesta", () => {
  it.each(CON_PENDIENTE)("a una %s se le nombra el correo que indicó", (type) => {
    for (const [, fn] of GENERADORES_CON_CORREO) {
      const texto = fn({ type, ticketNumber: TICKET, customerEmail: EMAIL });
      expect(texto).toMatch(DA_POR_HECHO_EL_CORREO);
      expect(texto).toMatch(PROMETE_ENVIO);
    }
  });

  it("ya no se le vuelve a pedir el correo que acaba de dar", () => {
    const culpables = casos({ customerEmail: EMAIL })
      .filter((c) => PIDE_CORREO.test(c.texto))
      .map((c) => `${c.generador}/${c.type}`);
    expect(culpables).toEqual([]);
  });
});

// ─── 2. Una felicitación no se responde con una disculpa ──────────────────────

describe("una felicitación nunca se trata como un problema", () => {
  const felicitaciones = (extra: Partial<PqrAckInput> = {}) =>
    (extra.customerEmail ? GENERADORES_CON_CORREO : GENERADORES).map(
      ([generador, fn]) => ({
        generador,
        texto: fn({
          type: "compliment",
          ticketNumber: TICKET,
          ...extra,
          customerEmail: extra.customerEmail ?? "",
        }),
      })
    );

  it("nunca se disculpa", () => {
    for (const { generador, texto } of [
      ...felicitaciones(),
      ...felicitaciones({ customerEmail: EMAIL }),
      ...felicitaciones({ module: "facturacion", customerEmail: EMAIL }),
    ]) {
      expect(texto, `${generador} se disculpó ante una felicitación`).not.toMatch(
        SE_DISCULPA
      );
    }
  });

  it("nunca pide 'ayudarnos a mejorar': no hay nada que mejorar", () => {
    for (const { generador, texto } of [
      ...felicitaciones(),
      ...felicitaciones({ customerEmail: EMAIL }),
    ]) {
      expect(texto, `${generador} pidió ayuda para mejorar`).not.toMatch(
        PIDE_AYUDA_PARA_MEJORAR
      );
    }
  });

  it("no habla de correo ni promete nada: no hay nada pendiente que enviar", () => {
    for (const { generador, texto } of felicitaciones({ customerEmail: EMAIL })) {
      expect(texto, `${generador} habló de correo`).not.toMatch(MENCIONA_CORREO);
      expect(texto, `${generador} prometió un envío`).not.toMatch(PROMETE_ENVIO);
    }
  });

  it("ni siquiera con el módulo de facturación se le promete una factura", () => {
    for (const [, fn] of GENERADORES) {
      const texto = fn({
        type: "compliment",
        ticketNumber: TICKET,
        module: "facturacion",
        customerEmail: EMAIL,
      });
      expect(texto.toLowerCase()).not.toContain("factura");
    }
  });

  it("agradece, que es lo único que corresponde", () => {
    for (const [, fn] of GENERADORES) {
      expect(fn({ type: "compliment", ticketNumber: TICKET })).toMatch(/gracias/i);
    }
  });
});

describe("solo las quejas y los reclamos abren con una disculpa", () => {
  it.each(TIPOS)("%s", (type) => {
    const debeDisculparse = type === "complaint" || type === "claim";
    for (const [generador, fn] of GENERADORES) {
      const texto = fn({ type, ticketNumber: TICKET, customerEmail: EMAIL });
      // `pqrAlreadyRegisteredMessage` responde a una insistencia: ahí la
      // disculpa ya se dio al registrar y repetirla suena a bucle.
      if (generador === "pqrAlreadyRegisteredMessage") {
        expect(texto).not.toMatch(SE_DISCULPA);
        continue;
      }
      expect(SE_DISCULPA.test(texto), `${generador} / ${type}`).toBe(
        debeDisculparse
      );
    }
  });
});

// ─── 3. El acuse de escalamiento no inventa un registro ───────────────────────

describe("HUMAN_HANDOFF_UNAVAILABLE_MESSAGE — el cliente pide hablar con alguien", () => {
  const msg = HUMAN_HANDOFF_UNAVAILABLE_MESSAGE;

  it("no afirma que se haya registrado nada: todavía no existe ninguna PQR", () => {
    expect(msg).not.toMatch(AFIRMA_REGISTRO);
  });

  it("no menciona un ticket que aún no se ha generado", () => {
    expect(msg).not.toMatch(MENCIONA_TICKET);
  });

  it("no promete un correo: el cliente puede no habérnoslo dado nunca", () => {
    expect(msg).not.toMatch(DA_POR_HECHO_EL_CORREO);
    expect(msg).not.toMatch(PROMETE_ENVIO);
  });

  /**
   * Aquí NO existe ninguna PQR: `escalate_to_human` no crea ticket ni escala
   * nada. Pedir el correo en este punto es pedirlo para nada — el interceptor
   * que lo engancha exige una PQR abierta— y, si el cliente arrastra un ticket
   * viejo sin correo, se lo pegaría a ESE caso, que no tiene que ver con lo que
   * está pidiendo ahora.
   */
  it("NO pide el correo: todavía no hay ningún caso al que sumarlo", () => {
    expect(msg).not.toMatch(PIDE_CORREO);
    expect(msg).not.toMatch(MENCIONA_CORREO);
  });

  it("no habla de 'tu caso' como si ya existiera un registro", () => {
    expect(msg).not.toMatch(/(?:a|en) tu caso\b/i);
  });

  it("ofrece el canal que sí es real: la respuesta por este mismo WhatsApp", () => {
    expect(msg).toMatch(/whatsapp/i);
  });

  it("no promete atención humana en vivo ni transferencias", () => {
    expect(msg).not.toMatch(/te transfiero|un agente te (?:atender|contactar)/i);
    expect(msg).not.toMatch(/asesores? (?:en l[íi]nea|disponibles?) (?:ahora|ya)/i);
    expect(msg).not.toMatch(/te contactaremos|si es necesario/i);
  });

  it("invita a contar el caso: es lo que dispara el registro de la PQR", () => {
    expect(msg).toMatch(/cu[ée]ntame|qu[ée] necesitas/i);
  });
});

// ─── 4. Facturación electrónica: no prometer inmediatez ───────────────────────

describe("factura electrónica — lo envía una persona, no el sistema", () => {
  const conCorreo = pqrConfirmationMessage({
    type: "petition",
    ticketNumber: TICKET,
    module: "facturacion",
    customerEmail: EMAIL,
  });

  it("no promete que la factura llegue al instante", () => {
    expect(conCorreo).not.toMatch(
      /de inmediato|inmediatamente|en seguida|enseguida|en unos minutos|autom[áa]tic/i
    );
  });

  it("avisa de que puede tardar", () => {
    expect(conCorreo).toMatch(/puede tomar|horas h[áa]biles|d[íi]as h[áa]biles/i);
  });

  it("deja una salida por si no llega, en vez de dejar al cliente esperando", () => {
    expect(conCorreo).toMatch(/si no te llega|si no la recibes/i);
  });

  it("el módulo se reconoce con tilde y sin ella (así lo manda el planner)", () => {
    for (const module of ["facturacion", "facturación", "  FACTURACIÓN  "]) {
      const texto = pqrConfirmationMessage({
        type: "petition",
        ticketNumber: TICKET,
        module,
        customerEmail: EMAIL,
      });
      expect(texto.toLowerCase(), `módulo "${module}"`).toContain(
        "factura electr"
      );
    }
  });

  it("sin correo pide el correo para la factura, con tilde o sin ella", () => {
    for (const module of ["facturacion", "facturación"]) {
      const texto = pqrConfirmationMessage({
        type: "petition",
        ticketNumber: TICKET,
        module,
        emailFollowUpAvailable: true,
      });
      expect(texto.toLowerCase()).toContain("factura electr");
      expect(texto).toMatch(PIDE_CORREO);
      expect(texto).not.toMatch(PROMETE_ENVIO);
    }
  });

  it("sin correo y sin enganche, no le pide un correo que nadie leería", () => {
    const texto = pqrConfirmationMessage({
      type: "petition",
      ticketNumber: TICKET,
      module: "facturación",
      emailFollowUpAvailable: false,
    });
    expect(texto).not.toMatch(MENCIONA_CORREO);
    expect(texto).not.toMatch(PROMETE_ENVIO);
    // Pero sigue diciéndole que su solicitud de facturación está en marcha.
    expect(texto.toLowerCase()).toContain("facturación");
    expect(texto).toContain(TICKET);
  });
});

// ─── 5. Insistencia del cliente: pqrAlreadyRegisteredMessage ──────────────────

describe("pqrAlreadyRegisteredMessage — respeta el tipo y el correo del ticket", () => {
  it.each(TIPOS)("siempre devuelve el ticket que el cliente ya tiene (%s)", (type) => {
    expect(pqrAlreadyRegisteredMessage({ type, ticketNumber: TICKET })).toContain(
      TICKET
    );
  });

  it("no repite el flujo completo: no vuelve a decir que 'quedó registrada'", () => {
    const msg = pqrAlreadyRegisteredMessage({
      type: "complaint",
      ticketNumber: TICKET,
    });
    expect(msg).not.toMatch(/qued[óo] registrad/i);
    expect(msg).toMatch(/ya est[áa] registrad/i);
  });

  it("concuerda el género del tipo", () => {
    expect(
      pqrAlreadyRegisteredMessage({ type: "claim", ticketNumber: TICKET })
    ).toContain("reclamo ya está registrado");
    expect(
      pqrAlreadyRegisteredMessage({ type: "suggestion", ticketNumber: TICKET })
    ).toContain("sugerencia ya está registrada");
  });

  it("con correo apunta al correo; sin correo lo pide", () => {
    const con = pqrAlreadyRegisteredMessage({
      type: "claim",
      ticketNumber: TICKET,
      customerEmail: EMAIL,
    });
    const sin = pqrAlreadyRegisteredMessage({
      type: "claim",
      ticketNumber: TICKET,
      emailFollowUpAvailable: true,
    });
    expect(con).toMatch(DA_POR_HECHO_EL_CORREO);
    expect(sin).toMatch(PIDE_CORREO);
    expect(sin).not.toMatch(DA_POR_HECHO_EL_CORREO);
  });

  it("a una felicitación no le promete una respuesta que nadie va a mandar", () => {
    const msg = pqrAlreadyRegisteredMessage({
      type: "compliment",
      ticketNumber: TICKET,
      customerEmail: EMAIL,
    });
    expect(msg).not.toMatch(PROMETE_ENVIO);
    expect(msg).not.toMatch(SE_DISCULPA);
  });

  it("respeta el módulo de facturación del ticket original", () => {
    const msg = pqrAlreadyRegisteredMessage({
      type: "petition",
      ticketNumber: TICKET,
      module: "facturación",
      customerEmail: EMAIL,
    });
    expect(msg.toLowerCase()).toContain("factura electr");
  });
});

describe("pqrEmailAttachedMessage — el correo quedó anotado", () => {
  const anexado = (extra: Omit<Partial<PqrAckInput>, "customerEmail"> = {}) =>
    pqrEmailAttachedMessage({
      ticketNumber: TICKET,
      ...extra,
      // El correo NO es opcional aquí: este mensaje solo existe cuando acabamos
      // de anotarlo. Que el tipo lo exija es parte del arreglo.
      customerEmail: EMAIL,
    });

  it("confirma el correo exacto y el ticket al que se enganchó", () => {
    expect(anexado()).toContain(EMAIL);
    expect(anexado()).toContain(TICKET);
  });

  it.each(CON_PENDIENTE)(
    "a una %s ya sí puede prometerle el envío: hay a dónde mandarlo",
    (type) => {
      expect(anexado({ type })).toMatch(PROMETE_ENVIO);
    }
  );

  /**
   * El camino es real: `getRecentOpenByPhone` devuelve cualquier PQR abierta de
   * los últimos 14 días sin mirar el tipo, felicitaciones incluidas. Si el
   * cliente registra una felicitación y luego manda un correo suelto, este es
   * el texto que recibe.
   */
  it("a una FELICITACIÓN no le promete una respuesta que nadie va a mandar", () => {
    const msg = anexado({ type: "compliment" });
    expect(msg).not.toMatch(PROMETE_ENVIO);
    expect(msg).not.toMatch(SE_DISCULPA);
    expect(msg).not.toMatch(PIDE_AYUDA_PARA_MEJORAR);
    expect(msg).toContain(EMAIL);
  });

  it("respeta el módulo de facturación del ticket al que se enganchó", () => {
    expect(anexado({ type: "petition", module: "facturación" }).toLowerCase()).toContain(
      "factura electr"
    );
  });

  it("no vuelve a pedir el correo que el cliente acaba de dar", () => {
    for (const type of TIPOS) {
      expect(anexado({ type })).not.toMatch(PIDE_CORREO);
    }
  });
});

// ─── 6. El acuse pegado al mensaje del modelo (ramal OpenClaw) ────────────────

describe("mergePqrAckSuffix — el cliente recibe una sola burbuja coherente", () => {
  it("una felicitación no se contamina con la disculpa del acuse", () => {
    const suffix = pqrConfirmationSuffix({
      type: "compliment",
      ticketNumber: TICKET,
    });
    const final = mergePqrAckSuffix("¡Qué alegría leer esto!", suffix);
    expect(final).not.toMatch(SE_DISCULPA);
    expect(final).not.toMatch(PIDE_AYUDA_PARA_MEJORAR);
    expect(final).toContain(TICKET);
  });

  it("sin correo, el acuse pegado sigue sin prometer un envío", () => {
    const suffix = pqrConfirmationSuffix({
      type: "complaint",
      ticketNumber: TICKET,
    });
    const final = mergePqrAckSuffix("Lamentamos lo sucedido.", suffix);
    expect(final).not.toMatch(PROMETE_ENVIO);
    expect(final).not.toMatch(DA_POR_HECHO_EL_CORREO);
    expect(final).toContain(TICKET);
  });

  it("el ticket sobrevive aunque el modelo haya dicho ya todo lo demás", () => {
    const suffix = pqrConfirmationSuffix({
      type: "claim",
      ticketNumber: TICKET,
      customerEmail: EMAIL,
    });
    const modelo =
      "Lamentamos lo sucedido con tu pedido. Gracias por ayudarnos a mejorar.";
    const final = mergePqrAckSuffix(modelo, suffix);
    expect(final).toContain(TICKET);
    // Y sin disculparse dos veces en la misma burbuja.
    expect(final.match(/lamenta/gi)).toHaveLength(1);
  });
});

// ─── 7. Las reglas de tono llegan a los DOS ramales del bot ───────────────────
//
// OpenClaw es el camino primario de WhatsApp y no recibe `modulesContext`: si
// las reglas solo viajan en el bloque del supportAgent, en producción son código
// muerto y el modelo vuelve a prometer transferencias a un humano.

describe("reglas del modo email-only — misma fuente para los dos ramales", () => {
  const bloque = emailOnlySupportPromptBlock();
  const linea = emailOnlySupportGatewayLine();

  const REGLAS_IRRENUNCIABLES: Array<[string, RegExp]> = [
    ["prohíbe transferir a un humano", /NO transfieras a especialista|NO hay atenci[óo]n humana en vivo/i],
    ["prohíbe 'te contactaremos si es necesario'", /te contactaremos si es necesario/i],
    ["prohíbe usar la tool de escalamiento", /escalateConversationTool|escalate_to_human/i],
    ["solo promete correo si el cliente ya lo dio", /Solo puedes prometer env[íi]os por correo SI el cliente ya dio su correo/i],
    ["manda registrar la PQR en vez de escalar", /createPQRTool|create_pqr/i],
    ["pide disculpa en queja y reclamo", /QUEJA o RECLAMO.*disculpa/is],
    ["prohíbe disculparse ante una felicitación", /NUNCA te disculpes ante una FELICITACI[ÓO]N/i],
  ];

  it.each(REGLAS_IRRENUNCIABLES)(
    "el ramal supportAgent %s",
    (_nombre, regla) => {
      expect(bloque).toMatch(regla);
    }
  );

  it.each(REGLAS_IRRENUNCIABLES)(
    "el ramal OpenClaw %s",
    (_nombre, regla) => {
      expect(linea).toMatch(regla);
    }
  );

  it("la línea de OpenClaw va en una sola línea: se inyecta dentro de modulesLine", () => {
    expect(linea).not.toContain("\n");
  });

  it("cabe de sobra en el presupuesto del payload de OpenClaw", () => {
    // `modulesLine` no pasa por ningún truncado, pero tampoco tiene sentido que
    // las reglas crezcan sin control dentro del prompt del gateway.
    expect(linea.length).toBeLessThan(2000);
  });
});

/**
 * Los tests de arriba prueban que la función devuelve las reglas, no que
 * alguien la llame. El bug original era exactamente ese: las reglas existían y
 * nadie las inyectaba en el ramal que atiende WhatsApp de verdad.
 *
 * Sin un entorno de Convex la única forma de comprobar el cableado es leer el
 * fuente. Es un test deliberadamente tonto y de una sola cosa: si falla por un
 * renombrado, se arregla en diez segundos; si falla porque alguien borró la
 * inyección, acaba de evitar que el bot vuelva a prometer un asesor humano.
 */
describe("cableado: la línea de reglas llega al payload de OpenClaw", () => {
  const fuente = readFileSync(
    new URL("../convex/system/ycloud.ts", import.meta.url),
    "utf-8"
  );

  it("modulesLine incluye las reglas del modo email-only", () => {
    const asignacion = fuente.match(/const modulesLine =[\s\S]*?;\n/);
    expect(asignacion, "no se encontró la asignación de modulesLine").not.toBeNull();
    expect(asignacion![0]).toContain("emailOnlySupportGatewayLine()");
  });

  it("modulesLine viaja dentro del payload que se le manda al gateway", () => {
    const payload = fuente.match(/const openClawBase = \{[\s\S]*?\n {8}\}/);
    expect(payload, "no se encontró el payload openClawBase").not.toBeNull();
    expect(payload![0]).toMatch(/^\s*modulesLine,$/m);
  });
});
