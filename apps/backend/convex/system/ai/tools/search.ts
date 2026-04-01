import { createTool } from "@convex-dev/agent";
import { jsonSchema } from "ai";
import { internal } from "../../../_generated/api";
import rag from "../rag";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { SEARCH_INTERPRETER_PROMPT } from "../constants";
import { OPENAI_MODEL_PRIMARY } from "../openaiModels";

export const search = createTool({
  description:
    "OBLIGATORIA antes de responder al cliente sobre menú, precios, horarios, sedes, ubicación, domicilios, políticas o FAQs: busca en la base de conocimiento ya cargada del restaurante. Las respuestas deben basarse en lo que devuelve esta herramienta, no en conocimiento general. Puedes llamarla varias veces con distintas consultas si la primera no devuelve resultados.",
  args: jsonSchema<{ query: string }>({
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "La consulta para buscar. Para sedes usa términos como: 'sede [barrio]', 'sede [ciudad]', 'sedes domicilios', 'barrios sedes'. Prueba varias consultas si la primera no da resultados.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  }),
  handler: async (ctx, args) => {
    if (!ctx.threadId) {
      return "Falta el ID del hilo";
    }

    const conversation = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      { threadId: ctx.threadId }
    );

    if (!conversation) {
      return "Conversación no encontrada";
    }

    const tenantId = conversation.tenantId as string;

    // Genera variantes de la query para aumentar la probabilidad de match en el RAG.
    // El contenido suele estar en formato de tabla con encabezados como "LOCALES", "HORARIOS", "UBICACIONES".
    function buildQueryVariants(query: string): string[] {
      const variants: string[] = [query];
      const q = query.toLowerCase();

      const CITY_MAP: Record<string, string> = {
        medellin: "MEDELLIN",
        medellín: "MEDELLIN",
        bogota: "BOGOTA",
        bogotá: "BOGOTA",
        barranquilla: "BARRANQUILLA",
        rionegro: "RIONEGRO",
        villavicencio: "VILLAVICENCIO",
        uraba: "URABA",
        urabá: "URABA",
        bello: "MEDELLIN",
        envigado: "MEDELLIN",
        itagui: "MEDELLIN",
        itagüi: "MEDELLIN",
        sabaneta: "MEDELLIN",
      };

      const isLocationQuery = /(sedes?|locales?|horarios?|ubicaci[oó]n|direcci[oó]n|domicilios?)/i.test(q);
      const isFoodQuery = /(men[uú]|carta|platos?|comida|venden|tienen|ofrec|sirven|sopa|hamburguesa|carne|pollo|pescado|cerdo|bebida|combo|bandeja|precio)/i.test(q);

      if (isLocationQuery) {
        for (const [key, cityUpper] of Object.entries(CITY_MAP)) {
          if (q.includes(key)) {
            variants.push(`LOCALES ${cityUpper}`);
            variants.push(`horarios locales ${cityUpper}`);
            variants.push(`UBICACIONES ${cityUpper}`);
            break;
          }
        }
        if (variants.length === 1) {
          variants.push("LOCALES horarios direcciones");
          variants.push("UBICACIONES barrios sedes");
        }
      }

      if (isFoodQuery) {
        variants.push("carta platos bebidas menú");
        variants.push("combo hamburguesa carne pollo pescado");

        // Sinónimos gastronómicos: cuando el usuario usa un término coloquial,
        // buscamos también con los nombres reales de los platos del menú.
        const FOOD_SYNONYMS: Record<string, string[]> = {
          sopa: ["sancocho trifásico", "ajiaco santafereño", "cazuela paisa", "cazuela montañera", "calentado"],
          sopas: ["sancocho trifásico", "ajiaco santafereño", "cazuela paisa", "cazuela montañera", "calentado"],
          sancocho: ["sancocho trifásico", "ajiaco", "cazuela"],
          ajiaco: ["ajiaco santafereño", "sancocho", "cazuela"],
          parrilla: ["churrasco", "baby beef", "punta de anca", "bife de chorizo", "solomito", "costillas"],
          asado: ["churrasco", "baby beef", "punta de anca", "bife de chorizo", "costillas BBQ"],
          res: ["punta de anca", "churrasco", "baby beef", "bife de chorizo", "solomito", "sobrebarriga"],
          tipico: ["bandeja paisa", "bandeja especial", "calentado paisa", "arroz paiso", "sancocho"],
          tipica: ["bandeja paisa", "bandeja especial", "calentado paisa", "arroz paiso", "sancocho"],
          entrada: ["chorizo", "deditos mozarella", "chicharrón", "empanaditas", "yuquitas", "patacones"],
          postre: ["menú infantil", "Alpinito"],
          vegetariano: ["ensalada de la casa", "papa americana", "arepa de queso", "atún al carbón"],
          infantil: ["menú infantil nuggets pollo"],
          economico: ["combo", "2x combos", "menú infantil"],
          barato: ["combo", "2x combos", "menú infantil"],
        };

        for (const [term, synonyms] of Object.entries(FOOD_SYNONYMS)) {
          if (q.includes(term)) {
            variants.push(synonyms.join(" "));
            break;
          }
        }
      }

      if (!isLocationQuery && !isFoodQuery) return variants;

      return [...new Set(variants)];
    }

    const queries = buildQueryVariants(args.query);
    let searchResult = await rag.search(ctx, { namespace: tenantId, query: queries[0], limit: 15 });

    // Reintento automático con variantes si la primera query no devuelve resultados
    for (let i = 1; i < queries.length && !searchResult.entries.length; i++) {
      console.log(`search.ts: reintentando con variante [${i}]: "${queries[i]}"`);
      searchResult = await rag.search(ctx, { namespace: tenantId, query: queries[i], limit: 15 });
    }

    if (!searchResult.entries.length) {
      return `⚠️ INSTRUCCIÓN INTERNA (no mostrar al cliente): El RAG no encontró información para esta consulta tras ${queries.length} intentos. NO INVENTES datos (sedes, horarios, precios, etc.). Responde al cliente que no tienes esa información disponible y ofrece conectarle con el restaurante si lo desea.`;
    }

    const contextText = `Resultados en ${searchResult.entries
      .map((e) => e.title || null)
      .filter((t) => t !== null)
      .join(", ")}. Contexto:\n\n${searchResult.text}`;

    const response = await generateText({
      messages: [
        { role: "system", content: SEARCH_INTERPRETER_PROMPT },
        {
          role: "user",
          content: `El cliente preguntó: ${args.query}\n\nBúsqueda: ${contextText}`,
        },
      ],
      model: openai.chat(OPENAI_MODEL_PRIMARY),
    });

    return response.text;
  },
});
