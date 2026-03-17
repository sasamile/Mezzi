import { createTool } from "@convex-dev/agent";
import { jsonSchema } from "ai";
import { api, internal } from "../../../_generated/api";
import { Doc } from "../../../_generated/dataModel";

/**
 * Busca vacantes y ubicaciones de Trabaja con Nosotros.
 * El chat la usa cuando el cliente pregunta por trabajo, vacantes, o quiere postularse.
 */
export const searchVacancies = createTool({
  description:
    "Buscar vacantes abiertas y ubicaciones del restaurante (ciudades, centros comerciales, puestos como PARRILLERO, MESERA, CAJERO). Usa cuando el cliente pregunte: '¿tienen vacantes?', '¿dónde pueden trabajar?', 'quiero trabajar con ustedes', '¿qué puestos hay?' o similares.",
  args: jsonSchema<{ cityFilter?: string }>({
    type: "object",
    properties: {
      cityFilter: {
        type: "string",
        description:
          "Ciudad para filtrar (opcional). Ej: Medellín, Bogotá, Barranquilla. Si el cliente indicó ciudad, pásala aquí.",
      },
    },
    required: [],
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
    if (tenant?.enabledModules?.trabajaConNosotros === false) {
      return "Este restaurante no tiene habilitado el módulo Trabaja con Nosotros. No tengo información sobre vacantes. Sugiere al cliente contactar directamente al restaurante.";
    }

    const locations = await ctx.runQuery(api.jobLocations.list, {
      tenantId,
      city: args.cityFilter?.trim() || undefined,
    });

    if (!locations.length) {
      return "No hay vacantes registradas en este momento. Sugiere al cliente que consulte directamente con el restaurante o vuelva a preguntar más adelante.";
    }

    const byCity = locations.reduce<Record<string, Doc<"jobLocations">[]>>(
      (acc: Record<string, Doc<"jobLocations">[]>, loc: Doc<"jobLocations">) => {
        if (!acc[loc.city]) acc[loc.city] = [];
        acc[loc.city].push(loc);
        return acc;
      },
      {}
    );

    const lines: string[] = [
      "Vacantes abiertas por ciudad y sede:",
      "",
    ];
    for (const [city, locs] of Object.entries(byCity).sort()) {
      lines.push(`*${city}*`);
      for (const loc of (locs as Doc<"jobLocations">[]).sort(
        (a: Doc<"jobLocations">, b: Doc<"jobLocations">) =>
          a.mallName.localeCompare(b.mallName)
      )) {
        const name = loc.isPrincipal ? `${loc.mallName} (Principal)` : loc.mallName;
        const vacs = loc.vacancies.length ? loc.vacancies.join(", ") : "Sin vacantes específicas";
        lines.push(`- ${name}: ${vacs}`);
      }
      lines.push("");
    }
    lines.push(
      "Para postularse, responde SIEMPRE con los correos y enlaces oficiales del restaurante para enviar la hoja de vida (por ejemplo: correos de recursos humanos o página de 'Trabaja con nosotros'). No registres postulaciones en tablas internas."
    );

    return lines.join("\n");
  },
});
