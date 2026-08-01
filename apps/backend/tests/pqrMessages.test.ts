import { describe, expect, it } from "vitest";
import {
  extractEmail,
  looksLikeBareEmail,
  looksLikePqrFollowUp,
  mergePqrAckSuffix,
  normalizePqrType,
  pqrAlreadyRegisteredMessage,
  pqrConfirmationMessage,
  pqrConfirmationSuffix,
  pqrTypeLabel,
  HUMAN_HANDOFF_UNAVAILABLE_MESSAGE,
  type PqrAckInput,
  type PqrType,
} from "../convex/system/alcarbon";

/**
 * Textos que recibe el cliente por WhatsApp al registrar una PQR.
 *
 * El riesgo que cubren estos tests no es técnico sino de imagen: el cliente
 * pidió anteponer "lamentamos lo sucedido" a las PQR, y aplicarlo a ciegas
 * haría que el bot se disculpara ante una FELICITACIÓN. Ese caso es el que
 * más se vigila aquí.
 */

const TICKET = "123456";
const EMAIL = "cliente@ejemplo.com";
const DISCULPA = "Lamentamos";
const MEJORAR = "ayudarnos a mejorar";
const PROMESA_CORREO = "Al correo que nos indicaste";

const TODOS_LOS_TIPOS: PqrType[] = [
  "petition",
  "complaint",
  "claim",
  "suggestion",
  "compliment",
];

/** Tipos que SÍ deben abrir con una disculpa. */
const CON_DISCULPA: PqrType[] = ["complaint", "claim"];
const SIN_DISCULPA = TODOS_LOS_TIPOS.filter((t) => !CON_DISCULPA.includes(t));

describe("normalizePqrType", () => {
  it("acepta los valores del enum tal cual", () => {
    for (const tipo of TODOS_LOS_TIPOS) {
      expect(normalizePqrType(tipo)).toBe(tipo);
    }
  });

  it("acepta los sinónimos en español que suele devolver el planner", () => {
    expect(normalizePqrType("queja")).toBe("complaint");
    expect(normalizePqrType("reclamo")).toBe("claim");
    expect(normalizePqrType("peticion")).toBe("petition");
    expect(normalizePqrType("sugerencia")).toBe("suggestion");
    expect(normalizePqrType("felicitacion")).toBe("compliment");
    expect(normalizePqrType("agradecimiento")).toBe("compliment");
  });

  it("tolera acentos, mayúsculas y espacios sobrantes", () => {
    expect(normalizePqrType("  Felicitación ")).toBe("compliment");
    expect(normalizePqrType("RECLAMACIÓN")).toBe("claim");
  });

  it("devuelve null cuando no reconoce el valor", () => {
    for (const valor of ["", "   ", "cualquier_cosa", null, undefined]) {
      expect(normalizePqrType(valor)).toBeNull();
    }
  });
});

describe("pqrTypeLabel", () => {
  it("traduce cada tipo a su etiqueta en español", () => {
    expect(pqrTypeLabel("complaint")).toBe("Queja");
    expect(pqrTypeLabel("claim")).toBe("Reclamo");
    expect(pqrTypeLabel("compliment")).toBe("Felicitación");
  });

  it("cae en 'solicitud' ante un tipo desconocido, nunca en el valor crudo", () => {
    expect(pqrTypeLabel("basura")).toBe("solicitud");
    expect(pqrTypeLabel(undefined)).toBe("solicitud");
  });
});

describe("pqrConfirmationMessage — disculpa según el tipo", () => {
  it.each(CON_DISCULPA)("una %s sí abre pidiendo disculpas", (type) => {
    const msg = pqrConfirmationMessage({
      type,
      ticketNumber: TICKET,
      customerEmail: EMAIL,
    });
    expect(msg).toContain(DISCULPA);
    expect(msg.indexOf(DISCULPA)).toBe(0); // la disculpa va de primeras
  });

  it.each(SIN_DISCULPA)("una %s NUNCA se disculpa", (type) => {
    const msg = pqrConfirmationMessage({
      type,
      ticketNumber: TICKET,
      customerEmail: EMAIL,
    });
    expect(msg).not.toContain(DISCULPA);
  });

  it("un tipo desconocido sale neutro, sin disculpa", () => {
    const msg = pqrConfirmationMessage({
      type: "no_existe",
      ticketNumber: TICKET,
      customerEmail: EMAIL,
    });
    expect(msg).not.toContain(DISCULPA);
    expect(msg).toContain(TICKET);
  });
});

describe("pqrConfirmationMessage — cierre según el tipo", () => {
  it.each(["complaint", "claim", "suggestion"] as PqrType[])(
    "una %s cierra agradeciendo la ayuda para mejorar",
    (type) => {
      const msg = pqrConfirmationMessage({
        type,
        ticketNumber: TICKET,
        customerEmail: EMAIL,
      });
      expect(msg).toContain(MEJORAR);
    }
  );

  it("una felicitación NO dice 'ayudarnos a mejorar' (no hay nada que mejorar)", () => {
    const msg = pqrConfirmationMessage({
      type: "compliment",
      ticketNumber: TICKET,
      customerEmail: EMAIL,
    });
    expect(msg).not.toContain(MEJORAR);
    expect(msg).toContain("Gracias");
  });

  it("una felicitación no promete enviar nada: no hay nada pendiente", () => {
    const msg = pqrConfirmationMessage({
      type: "compliment",
      ticketNumber: TICKET,
      customerEmail: EMAIL,
    });
    expect(msg).not.toContain(PROMESA_CORREO);
  });
});

describe("pqrConfirmationMessage — promesa de envío al correo", () => {
  it.each(["petition", "complaint", "claim", "suggestion"] as PqrType[])(
    "con correo, a una %s se le promete respuesta al correo indicado",
    (type) => {
      const msg = pqrConfirmationMessage({
        type,
        ticketNumber: TICKET,
        customerEmail: EMAIL,
      });
      expect(msg).toContain(PROMESA_CORREO);
    }
  );

  it.each(TODOS_LOS_TIPOS)(
    "SIN correo, a una %s no se le promete un envío que no va a recibir",
    (type) => {
      const msg = pqrConfirmationMessage({ type, ticketNumber: TICKET });
      expect(msg).not.toContain(PROMESA_CORREO);
    }
  );

  it("un correo en blanco cuenta como no tener correo", () => {
    const msg = pqrConfirmationMessage({
      type: "complaint",
      ticketNumber: TICKET,
      customerEmail: "   ",
    });
    expect(msg).not.toContain(PROMESA_CORREO);
  });

  it("sin correo y siendo facturación, se le pide el correo al cliente", () => {
    const msg = pqrConfirmationMessage({
      type: "petition",
      ticketNumber: TICKET,
      module: "facturacion",
      // Solo se puede pedir el correo donde el interceptor lo va a enganchar.
      emailFollowUpAvailable: true,
    });
    expect(msg).toContain("correo");
    expect(msg).not.toContain(PROMESA_CORREO);
  });
});

/**
 * `emailFollowUpAvailable` es la tercera condición de la regla del producto:
 * solo se le pide el correo al cliente cuando el sistema puede engancharlo al
 * ticket. El interceptor que lo hace (system/ycloud.ts) solo corre en WhatsApp
 * y solo reencuentra la PQR por teléfono; en cualquier otro caso el correo se
 * pierde y el cliente se queda creyendo que quedó anotado.
 */
describe("pqrConfirmationMessage — el correo solo se pide si hay dónde anotarlo", () => {
  const sinEnganche = (extra: Partial<PqrAckInput> = {}) =>
    pqrConfirmationMessage({
      type: "complaint",
      ticketNumber: TICKET,
      emailFollowUpAvailable: false,
      ...extra,
    });

  it("sin enganche no menciona el correo por ningún lado", () => {
    expect(sinEnganche()).not.toContain("correo");
  });

  it("sin enganche sigue confirmando el registro y el ticket", () => {
    const msg = sinEnganche();
    expect(msg).toContain("Queja quedó registrada");
    expect(msg).toContain(TICKET);
  });

  it("sin enganche mantiene la disculpa y el cierre del tipo", () => {
    expect(sinEnganche()).toContain(DISCULPA);
    expect(sinEnganche()).toContain(MEJORAR);
  });

  it("la variante de facturación también calla el correo", () => {
    const msg = sinEnganche({ type: "petition", module: "facturación" });
    expect(msg).not.toContain("correo");
    expect(msg.toLowerCase()).toContain("facturación");
  });

  it("con el correo YA dado, la disponibilidad da igual: se promete el envío", () => {
    for (const emailFollowUpAvailable of [true, false, undefined]) {
      const msg = pqrConfirmationMessage({
        type: "complaint",
        ticketNumber: TICKET,
        customerEmail: EMAIL,
        emailFollowUpAvailable,
      });
      expect(msg, String(emailFollowUpAvailable)).toContain(PROMESA_CORREO);
    }
  });

  it("omitir el flag NO es 'disponible': por omisión se calla", () => {
    const msg = pqrConfirmationMessage({ type: "complaint", ticketNumber: TICKET });
    expect(msg).not.toContain("correo");
  });
});

describe("pqrConfirmationMessage — facturación electrónica", () => {
  it("con correo y módulo facturación, nombra la factura explícitamente", () => {
    const msg = pqrConfirmationMessage({
      type: "petition",
      ticketNumber: TICKET,
      module: "facturacion",
      customerEmail: EMAIL,
    });
    expect(msg).toContain(PROMESA_CORREO);
    expect(msg.toLowerCase()).toContain("factura");
  });

  it("el módulo se compara sin distinguir mayúsculas ni espacios", () => {
    const msg = pqrConfirmationMessage({
      type: "petition",
      ticketNumber: TICKET,
      module: "  FACTURACION  ",
      customerEmail: EMAIL,
    });
    expect(msg.toLowerCase()).toContain("factura");
  });

  it("reconoce el módulo con tilde, que es como lo escribe el planner", () => {
    for (const module of ["facturación", "Facturación", "  FACTURACIÓN  "]) {
      const msg = pqrConfirmationMessage({
        type: "petition",
        ticketNumber: TICKET,
        module,
        customerEmail: EMAIL,
      });
      expect(msg.toLowerCase()).toContain("factura electr");
    }
  });

  it("sin correo y con el módulo acentuado, pide el correo para la factura", () => {
    const msg = pqrConfirmationMessage({
      type: "petition",
      ticketNumber: TICKET,
      module: "facturación",
      emailFollowUpAvailable: true,
    });
    expect(msg.toLowerCase()).toContain("factura electr");
    expect(msg).not.toContain(PROMESA_CORREO);
  });

  it("otro módulo no menciona factura", () => {
    const msg = pqrConfirmationMessage({
      type: "petition",
      ticketNumber: TICKET,
      module: "limpieza",
      customerEmail: EMAIL,
    });
    expect(msg.toLowerCase()).not.toContain("factura");
  });
});

describe("pqrConfirmationMessage — estructura y concordancia", () => {
  it.each(TODOS_LOS_TIPOS)("el ticket siempre aparece (%s)", (type) => {
    const msg = pqrConfirmationMessage({ type, ticketNumber: TICKET });
    expect(msg).toContain(TICKET);
  });

  it("concuerda el género: un Reclamo queda 'registrado'", () => {
    const msg = pqrConfirmationMessage({
      type: "claim",
      ticketNumber: TICKET,
    });
    expect(msg).toContain("Reclamo quedó registrado");
  });

  it("concuerda el género: una Queja queda 'registrada'", () => {
    const msg = pqrConfirmationMessage({
      type: "complaint",
      ticketNumber: TICKET,
    });
    expect(msg).toContain("Queja quedó registrada");
  });

  it("incluye el asunto cuando el cliente lo dio", () => {
    const msg = pqrConfirmationMessage({
      type: "complaint",
      ticketNumber: TICKET,
      subject: "Demora en la entrega",
    });
    expect(msg).toContain("Demora en la entrega");
  });

  it("omite la línea de asunto cuando viene vacío", () => {
    const msg = pqrConfirmationMessage({
      type: "complaint",
      ticketNumber: TICKET,
      subject: "   ",
    });
    expect(msg).not.toContain("Asunto:");
  });

  it.each(TODOS_LOS_TIPOS)(
    "no deja líneas en blanco de más ni espacios al final (%s)",
    (type) => {
      const msg = pqrConfirmationMessage({
        type,
        ticketNumber: TICKET,
        customerEmail: EMAIL,
      });
      expect(msg).not.toMatch(/\n{3,}/);
      expect(msg).toBe(msg.trim());
    }
  );
});

describe("pqrConfirmationSuffix — ramal OpenClaw", () => {
  it("mantiene la misma regla de disculpa que el mensaje completo", () => {
    for (const type of CON_DISCULPA) {
      expect(
        pqrConfirmationSuffix({ type, ticketNumber: TICKET, customerEmail: EMAIL })
      ).toContain(DISCULPA);
    }
    for (const type of SIN_DISCULPA) {
      expect(
        pqrConfirmationSuffix({ type, ticketNumber: TICKET, customerEmail: EMAIL })
      ).not.toContain(DISCULPA);
    }
  });

  it("incluye ticket y etiqueta del tipo", () => {
    const suffix = pqrConfirmationSuffix({
      type: "complaint",
      ticketNumber: TICKET,
    });
    expect(suffix).toContain(TICKET);
    expect(suffix).toContain("Queja");
  });

  it("no repite el encabezado del mensaje completo (lo redacta el modelo)", () => {
    const suffix = pqrConfirmationSuffix({
      type: "complaint",
      ticketNumber: TICKET,
    });
    expect(suffix).not.toContain("quedó registrada correctamente");
  });
});

describe("pqrAlreadyRegisteredMessage — insistencia del cliente", () => {
  it.each(TODOS_LOS_TIPOS)(
    "SIN correo no promete un envío al correo (%s)",
    (type) => {
      const msg = pqrAlreadyRegisteredMessage({ type, ticketNumber: TICKET });
      expect(msg).not.toContain(PROMESA_CORREO);
      expect(msg).toContain(TICKET);
    }
  );

  it("a una felicitación no le promete 'respuesta': no hay nada pendiente", () => {
    const msg = pqrAlreadyRegisteredMessage({
      type: "compliment",
      ticketNumber: TICKET,
      customerEmail: EMAIL,
    });
    expect(msg).not.toContain(PROMESA_CORREO);
  });

  it("con correo sí promete la respuesta al correo indicado", () => {
    const msg = pqrAlreadyRegisteredMessage({
      type: "complaint",
      ticketNumber: TICKET,
      customerEmail: EMAIL,
    });
    expect(msg).toContain(PROMESA_CORREO);
  });

  it("concuerda el género del tipo", () => {
    expect(
      pqrAlreadyRegisteredMessage({ type: "claim", ticketNumber: TICKET })
    ).toContain("reclamo ya está registrado");
    expect(
      pqrAlreadyRegisteredMessage({ type: "complaint", ticketNumber: TICKET })
    ).toContain("queja ya está registrada");
  });

  it("un tipo desconocido cae en 'solicitud'", () => {
    expect(
      pqrAlreadyRegisteredMessage({ type: "basura", ticketNumber: TICKET })
    ).toContain("solicitud ya está registrada");
  });
});

describe("HUMAN_HANDOFF_UNAVAILABLE_MESSAGE", () => {
  it("no afirma que exista un registro: en ese punto no hay ninguna PQR", () => {
    expect(HUMAN_HANDOFF_UNAVAILABLE_MESSAGE).not.toMatch(/qued[óo] registrad/i);
    expect(HUMAN_HANDOFF_UNAVAILABLE_MESSAGE).not.toContain(PROMESA_CORREO);
    expect(HUMAN_HANDOFF_UNAVAILABLE_MESSAGE).not.toMatch(/ticket/i);
  });

  it("no habla de correo: no hay PQR abierta a la que engancharlo", () => {
    // El único mecanismo que anota un correo (`attachCustomerEmail` desde el
    // interceptor de system/ycloud.ts) necesita una PQR abierta, y en este
    // camino no se crea ninguna. Pedirlo aquí manda al cliente a escribir un
    // correo que se pierde o que se pega a un ticket viejo suyo.
    expect(HUMAN_HANDOFF_UNAVAILABLE_MESSAGE).not.toContain("correo");
    expect(HUMAN_HANDOFF_UNAVAILABLE_MESSAGE).not.toMatch(/tu caso/i);
  });

  it("ofrece el único canal que sí se cumple: la respuesta por WhatsApp", () => {
    expect(HUMAN_HANDOFF_UNAVAILABLE_MESSAGE).toMatch(/whatsapp/i);
  });

  it("no promete que 'te contactaremos si es necesario' (prohibido por el manual)", () => {
    expect(HUMAN_HANDOFF_UNAVAILABLE_MESSAGE).not.toMatch(/si es necesario/i);
  });
});

describe("mergePqrAckSuffix — no duplicar disculpa ni agradecimiento", () => {
  const SUFIJO = pqrConfirmationSuffix({
    type: "complaint",
    ticketNumber: TICKET,
    customerEmail: EMAIL,
  });

  it("quita la disculpa del acuse si el modelo ya se disculpó", () => {
    const modelo =
      "Lamentamos lo sucedido con tu pedido. Ya tomamos nota de lo que nos cuentas.";
    const final = mergePqrAckSuffix(modelo, SUFIJO);
    expect(final.match(/Lamentamos/g)).toHaveLength(1);
    expect(final).toContain(TICKET);
  });

  it("quita el cierre del acuse si el modelo ya agradeció", () => {
    const modelo = "Tomamos nota de tu caso. Gracias por ayudarnos a mejorar.";
    const final = mergePqrAckSuffix(modelo, SUFIJO);
    expect(final.match(/Gracias por/g)).toHaveLength(1);
  });

  it("quita las dos piezas cuando el modelo dijo ambas", () => {
    const modelo =
      "Lamentamos lo sucedido. Registramos tu caso. Gracias por ayudarnos a mejorar.";
    const final = mergePqrAckSuffix(modelo, SUFIJO);
    expect(final.match(/Lamentamos/g)).toHaveLength(1);
    expect(final.match(/Gracias por/g)).toHaveLength(1);
    expect(final).toContain(TICKET);
    expect(final).toContain(PROMESA_CORREO);
  });

  it("mantiene el acuse completo si el modelo no dijo nada parecido", () => {
    const modelo = "Ya quedó anotado en el sistema.";
    const final = mergePqrAckSuffix(modelo, SUFIJO);
    expect(final).toContain("Lamentamos");
    expect(final).toContain("Gracias por");
    expect(final).toContain(TICKET);
  });

  it("nunca pierde el ticket, dijera lo que dijera el modelo", () => {
    const modelo =
      "Lamentamos mucho lo sucedido. Gracias por escribirnos y por ayudarnos a mejorar.";
    expect(mergePqrAckSuffix(modelo, SUFIJO)).toContain(TICKET);
  });

  it("con mensaje del modelo vacío devuelve el acuse tal cual", () => {
    expect(mergePqrAckSuffix("   ", SUFIJO)).toBe(SUFIJO);
  });

  it("no deja líneas en blanco de más", () => {
    const final = mergePqrAckSuffix("Lamentamos lo sucedido.", SUFIJO);
    expect(final).not.toMatch(/\n{3,}/);
    expect(final).toBe(final.trim());
  });
});

describe("extractEmail / looksLikeBareEmail", () => {
  it("extrae el correo y lo normaliza a minúsculas", () => {
    expect(extractEmail("Juan.Perez@Gmail.COM")).toBe("juan.perez@gmail.com");
    expect(extractEmail("mi correo es juan@gmail.com.")).toBe("juan@gmail.com");
  });

  it("devuelve null si no hay correo", () => {
    expect(extractEmail("hola, alguna novedad?")).toBeNull();
  });

  it("acepta el correo suelto y las frases hechas que lo acompañan", () => {
    for (const texto of [
      "juan@gmail.com",
      "mi correo es juan@gmail.com",
      "Mi correo electrónico es juan@gmail.com",
      "correo: juan@gmail.com",
      "Este es mi correo juan@gmail.com, gracias",
      "envíamelo a juan@gmail.com por favor",
    ]) {
      expect(looksLikeBareEmail(texto), texto).toBe(true);
    }
  });

  it("rechaza mensajes que traen algo más que el correo", () => {
    expect(
      looksLikeBareEmail(
        "juan@gmail.com y además quiero poner otra queja porque el pedido llegó frío otra vez"
      )
    ).toBe(false);
  });

  /**
   * El caso que el umbral por longitud dejaba pasar: una queja REAL, corta, con
   * el correo pegado. El interceptor de system/ycloud.ts anota el correo,
   * responde "listo, lo anotamos" y hace `return`, así que el bot nunca llega a
   * leer la queja. Cualquier criterio nuevo tiene que seguir rechazándola.
   */
  it("una queja corta con el correo dentro NO es un correo suelto", () => {
    for (const texto of [
      "llego frio otra vez, correo j@gmail.com",
      "el domiciliario fue grosero, mi correo j@gmail.com",
      "quiero cancelar el pedido, juan@gmail.com",
    ]) {
      expect(looksLikeBareEmail(texto), texto).toBe(false);
    }
  });

  it("sin correo dentro nunca es un correo suelto", () => {
    expect(looksLikeBareEmail("mi correo es el de siempre")).toBe(false);
  });

  /**
   * El criterio ya NO es la longitud del resto (antes: "≤ 40 caracteres" y
   * ningún test lo fijaba: la constante podía valer entre 28 y 68 con la suite
   * en verde). Estos dos pares son la prueba: cada uno exige clasificar como
   * correo suelto el texto LARGO y como mensaje real el CORTO, así que ningún
   * umbral por longitud —el que sea— puede pasarlos a la vez.
   */
  describe("el criterio es 'no queda ninguna palabra con contenido', no la longitud", () => {
    /** Puro relleno, pero largo: 78 caracteres además del correo. */
    const LARGO_Y_VACIO =
      "Hola, buenas tardes. Mi correo electronico es juan@gmail.com, por favor envialo ahi. Gracias";
    /** Una queja de verdad, pero corta: 11 caracteres además del correo. */
    const CORTO_Y_CON_CONTENIDO = "juan@gmail.com llego frio";

    const resto = (texto: string) =>
      texto.replace(/[^\s<>()[\],;:@"]+@[^\s<>()[\],;:@"]+\.[a-z]{2,}/i, "").length;

    it("el par es indistinguible por longitud: el vacío es el largo", () => {
      expect(resto(LARGO_Y_VACIO)).toBeGreaterThan(resto(CORTO_Y_CON_CONTENIDO));
    });

    it("relleno largo SÍ es un correo suelto", () => {
      expect(looksLikeBareEmail(LARGO_Y_VACIO)).toBe(true);
    });

    it("contenido corto NO es un correo suelto", () => {
      expect(looksLikeBareEmail(CORTO_Y_CON_CONTENIDO)).toBe(false);
    });

    /**
     * Justo por debajo y justo por encima del criterio real: una sola palabra
     * de diferencia, y de la misma longitud, decide si el interceptor se queda
     * el mensaje o lo deja llegar al bot.
     */
    it("una sola palabra con contenido lo cambia todo", () => {
      expect(looksLikeBareEmail("correo juan@gmail.com")).toBe(true);
      expect(looksLikeBareEmail("reclamo juan@gmail.com")).toBe(false);
    });

    it("la puntuación y los acentos no cuentan como contenido", () => {
      expect(looksLikeBareEmail("¡Listo! Mi correo electrónico: juan@gmail.com")).toBe(
        true
      );
    });
  });
});

/**
 * Detector de insistencia. Solo se consulta cuando el cliente ya tiene una PQR
 * abierta, y su respuesta hace que el bot conteste "tu queja ya está registrada
 * con el ticket #N" y NO responda nada más. Un falso positivo aquí es un
 * cliente que pregunta por el horario y recibe el estado de un ticket.
 */
describe("looksLikePqrFollowUp", () => {
  it.each([
    "¿Cómo va mi caso?",
    "quiero saber el estado de mi queja",
    "¿hay alguna novedad?",
    "no me han respondido nada",
    "sigo esperando",
    "siguen sin responder",
    "¿cuándo me responden?",
    "¿ya revisaron lo que pasó?",
    "mi ticket 250801-1234",
    "¿en qué va la PQR?",
    "¿qué pasó con mi solicitud?",
  ])("reconoce el seguimiento: %s", (texto) => {
    expect(looksLikePqrFollowUp(texto)).toBe(true);
  });

  it.each([
    "¿A qué hora atienden hoy?",
    "somos 6 personas, ¿tienen mesa?",
    "¿cuándo abren los domingos?",
    "¿sigue la promo de hamburguesas?",
    "¿alguien me confirma si hay domicilio a Envigado?",
    "quiero hablar con una persona",
    "¿tienen menú infantil?",
    "necesito la respuesta a esta pregunta: ¿aceptan tarjeta?",
  ])("no secuestra un mensaje normal: %s", (texto) => {
    expect(looksLikePqrFollowUp(texto)).toBe(false);
  });
});
