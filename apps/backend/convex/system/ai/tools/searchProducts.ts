import { createTool } from "@convex-dev/agent";
import { jsonSchema } from "ai";
import { searchUrbrandsProductsMarkdown } from "../../urbrands";

/**
 * Busca productos en WooCommerce (URBRANDS). Fallback cuando OpenClaw no está activo.
 */
export const searchProducts = createTool({
  description:
    "Busca productos publicados en la tienda URBRANDS (WooCommerce) por marca, tipo, modelo o categoría. Úsala SIEMPRE que el cliente mencione un producto, marca, talla o pregunte por disponibilidad, y también cuando detectes una marca o producto en una imagen. Devuelve nombre, precio, disponibilidad y link. Pasa 'search' como marca + tipo (ej: 'Gucci tenis', 'bolso LV', 'Nike sneakers').",
  args: jsonSchema<{ search: string }>({
    type: "object",
    properties: {
      search: {
        type: "string",
        description:
          "Texto de búsqueda: marca y tipo de producto. Ej: 'Gucci tenis', 'bolso LV', 'Nike sneakers', 'Hugo Boss camisa'.",
      },
    },
    required: ["search"],
    additionalProperties: false,
  }),
  handler: async (_ctx, args) => {
    const search = args.search?.trim();
    if (!search) {
      return "Pídele al cliente que indique la marca y el tipo de producto que busca (ej: 'Nike tenis', 'bolso LV').";
    }
    const md = await searchUrbrandsProductsMarkdown(search);
    return `INSTRUCCIÓN INTERNA: ${md}\n\nComparte los resultados con el cliente de forma natural. Si no hay productos, ofrece Por Encargo.`;
  },
});
