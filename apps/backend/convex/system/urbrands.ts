/**
 * Módulo backend dedicado a URBRANDS (tienda de ropa con WooCommerce/WordPress).
 *
 * Solo este tenant usa el agente "Danna" con búsqueda de productos en WooCommerce.
 * El resto de tenants (restaurantes) siguen usando el flujo normal.
 *
 * Esta lógica vive completamente en el backend (Convex). No requiere n8n.
 */

import type { Doc } from "../_generated/dataModel";

/** Dominio dedicado del tenant URBRANDS. Debe coincidir con `seedUrbrands` en tenants.ts. */
export const URBRANDS_DOMAIN = "urbrands.mezzi.app";

/** Normaliza un host/dominio para comparaciones (quita protocolo, www, path y puerto). */
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

/** True si el tenant es URBRANDS (por su dominio dedicado). */
export function isUrbrandsTenant(tenant: Doc<"tenants"> | null | undefined): boolean {
  if (!tenant) return false;
  return normalizeHost(tenant.customDomain) === URBRANDS_DOMAIN;
}

export interface UrbrandsWooConfig {
  /** Base del sitio WordPress/WooCommerce, ej: https://www.dev.urbrandsclothing.com */
  baseUrl: string;
  /** Valor completo del header Authorization (ej: "Basic <base64(ck:cs)>"). */
  authHeader: string;
}

/**
 * Configuración de la API WooCommerce de URBRANDS.
 *
 * Se lee de variables de entorno de Convex (Settings → Environment Variables):
 *   - URBRANDS_WC_URL   → base del sitio (sin /wp-json)
 *   - URBRANDS_WC_AUTH  → header Authorization completo ("Basic xxxx")
 *
 * Los valores por defecto apuntan al entorno DEV de URBRANDS para que funcione
 * de inmediato. En producción, define las variables de entorno y rota las llaves.
 */
export function getUrbrandsWooConfig(): UrbrandsWooConfig {
  const baseUrl =
    process.env.URBRANDS_WC_URL?.trim() || "https://www.dev.urbrandsclothing.com";
  const authHeader =
    process.env.URBRANDS_WC_AUTH?.trim() ||
    "Basic Y2tfNTE2NThlZmYwZTRkMGRkNDY0M2Y2N2NkZjgzMTk0NjdlODY4NTg4MDpjc19mZTE3Mjg2MmJkNDZjOGRjNDZlNDU0MGM4YmI3NWRkNjQ2OTg2MzZm";
  return { baseUrl: baseUrl.replace(/\/+$/, ""), authHeader };
}

interface WooProduct {
  name?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  stock_status?: string;
  stock_quantity?: number | null;
  permalink?: string;
}

function formatWooPrice(raw?: string): string {
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toLocaleString("es-CO")}`;
}

/**
 * Consulta WooCommerce y devuelve un listado en markdown para OpenClaw o el tool del agente.
 */
export async function searchUrbrandsProductsMarkdown(
  search: string
): Promise<string> {
  const query = search.trim();
  if (!query) {
    return "Falta el texto de búsqueda (marca + tipo de producto, ej: 'Gucci tenis').";
  }

  const cfg = getUrbrandsWooConfig();
  const url = new URL(`${cfg.baseUrl}/wp-json/wc/v3/products`);
  url.searchParams.set("search", query);
  url.searchParams.set("per_page", "8");
  url.searchParams.set("status", "publish");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Authorization: cfg.authHeader,
        Accept: "application/json",
      },
    });
  } catch (err) {
    console.error("searchUrbrandsProducts: fetch falló", err);
    return "No pude consultar el catálogo en línea. Ofrece la opción Por Encargo o escala con un asesor.";
  }

  if (!res.ok) {
    console.error("searchUrbrandsProducts: respuesta no OK", res.status);
    return `El catálogo respondió con error ${res.status}. No inventes productos; ofrece Por Encargo o escala.`;
  }

  let products: WooProduct[];
  try {
    products = (await res.json()) as WooProduct[];
  } catch {
    return "No pude leer la respuesta del catálogo. Ofrece Por Encargo o escala con un asesor.";
  }

  if (!Array.isArray(products) || products.length === 0) {
    return `No hay productos para "${query}" en inventario inmediato. Ofrece la opción Por Encargo (Drive + web oficial de la marca). NO inventes productos.`;
  }

  const lines = products.slice(0, 8).map((p) => {
    const price =
      formatWooPrice(p.sale_price) ||
      formatWooPrice(p.price) ||
      formatWooPrice(p.regular_price);
    const inStock = p.stock_status === "instock";
    const stockLabel = inStock
      ? p.stock_quantity && p.stock_quantity > 0
        ? `Disponible (${p.stock_quantity} en stock)`
        : "Disponible"
      : "Agotado";
    const parts = [`- ${p.name ?? "Producto"}`];
    if (price) parts.push(`— ${price}`);
    parts.push(`(${stockLabel})`);
    const head = parts.join(" ");
    return p.permalink ? `${head}\n  ${p.permalink}` : head;
  });

  return [
    `PRODUCTOS URBRANDS para "${query}" (copiar nombre, precio y link; no inventar):`,
    "",
    ...lines,
  ].join("\n");
}
