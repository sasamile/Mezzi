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
  id?: number;
  name?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  stock_status?: string;
  stock_quantity?: number | null;
  permalink?: string;
}

interface ParsedProductQuery {
  brand?: string;
  brandTerms: string[];
  productType?: string;
  size?: string;
  categoryIds: number[];
  catalogUrl?: string;
}

/** Marcas frecuentes → términos que aparecen en el nombre del producto en WooCommerce. */
const BRAND_ALIASES: Record<string, string[]> = {
  lv: ["LV", "LOUIS"],
  gucci: ["GUCCI"],
  nike: ["NIKE"],
  adidas: ["ADIDAS"],
  dior: ["DIOR"],
  prada: ["PRADA"],
  versace: ["VERSACE"],
  "hugo boss": ["HUGO", "BOSS"],
  boss: ["BOSS", "HUGO"],
  ferragamo: ["FERRAGAMO"],
  balenciaga: ["BALENCIAGA"],
  fendi: ["FENDI"],
  burberry: ["BURBERRY"],
  valentino: ["VALENTINO"],
  "off-white": ["OFF-WHITE", "OFF WHITE"],
  moncler: ["MONCLER"],
  "louis vuitton": ["LV", "LOUIS"],
};

/** Tipo de producto → IDs de categoría WooCommerce (hombre por defecto). */
const CATEGORY_BY_TYPE: Record<string, { ids: number[]; catalogPath: string }> = {
  sandalias: {
    ids: [299, 300],
    catalogPath: "/categoria-producto/hombre-man/sneakers-sandalias-sneakers-sandals/",
  },
  sandalia: {
    ids: [299, 300],
    catalogPath: "/categoria-producto/hombre-man/sneakers-sandalias-sneakers-sandals/",
  },
  sneakers: {
    ids: [300],
    catalogPath: "/categoria-producto/hombre-man/sneakers-sandalias-sneakers-sandals/",
  },
  tenis: {
    ids: [300],
    catalogPath: "/categoria-producto/hombre-man/sneakers-sandalias-sneakers-sandals/",
  },
  zapatos: {
    ids: [300],
    catalogPath: "/categoria-producto/hombre-man/sneakers-sandalias-sneakers-sandals/",
  },
  bolso: {
    ids: [310],
    catalogPath: "/categoria-producto/mujer-woman/bolsos-bags/",
  },
  bolsos: {
    ids: [310],
    catalogPath: "/categoria-producto/mujer-woman/bolsos-bags/",
  },
};

/** Tallas de calzado → términos del atributo pa_talla en WooCommerce. */
const SIZE_ATTRIBUTE_TERMS: Record<string, number> = {
  "34": 89,
  "35": 90,
  "36": 91,
  "37": 92,
  "38": 94,
  "39": 98, // 39 (6.0 UK) — calzado hombre
  "40": 96, // 40 (7.0 UK)
  "41": 102,
  "42": 103,
  "43": 104,
  "44": 106,
  "45": 107,
};

function formatWooPrice(raw?: string): string {
  if (!raw) return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toLocaleString("es-CO")}`;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseProductQuery(raw: string): ParsedProductQuery {
  const text = raw.trim();
  const lower = normalizeText(text);
  const result: ParsedProductQuery = {
    brandTerms: [],
    categoryIds: [],
  };

  // Talla: "talla 39", "t39", "T40", o número suelto 34-45
  const tallaMatch =
    lower.match(/\bt(?:alla)?\s*(\d{2})\b/) ?? lower.match(/\bt(\d{2})\b/);
  if (tallaMatch) {
    result.size = tallaMatch[1];
  } else {
    const sizeAlone = lower.match(/\b(3[4-9]|4[0-5])\b/);
    if (sizeAlone) result.size = sizeAlone[1];
  }

  // Marca (orden: nombres compuestos primero)
  const brandKeys = Object.keys(BRAND_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of brandKeys) {
    const pattern = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(lower)) {
      result.brand = key;
      result.brandTerms = BRAND_ALIASES[key];
      break;
    }
  }

  // Tipo de producto
  for (const [type, cfg] of Object.entries(CATEGORY_BY_TYPE)) {
    if (lower.includes(type)) {
      result.productType = type;
      result.categoryIds = cfg.ids;
      result.catalogUrl = cfg.catalogPath;
      break;
    }
  }

  // Sin tipo explícito pero hay marca/talla → categoría sneakers & sandalias (inventario inmediato)
  if (!result.categoryIds.length && (result.brand || result.size)) {
    result.categoryIds = [300];
    result.catalogUrl = CATEGORY_BY_TYPE.sneakers.catalogPath;
  }

  return result;
}

function productMatchesBrand(name: string, brandTerms: string[]): boolean {
  if (!brandTerms.length) return true;
  const upper = name.toUpperCase();
  return brandTerms.some((term) => upper.includes(term.toUpperCase()));
}

function productMatchesSize(name: string, size: string): boolean {
  const upper = name.toUpperCase();
  const patterns = [
    new RegExp(`\\bT${size}\\b`),
    new RegExp(`\\bT${size}\\s`),
    new RegExp(`\\bT${size}\\(`),
    new RegExp(`\\b${size}\\s*\\(`),
  ];
  return patterns.some((p) => p.test(upper));
}

async function fetchWooProducts(
  cfg: UrbrandsWooConfig,
  params: Record<string, string>
): Promise<WooProduct[]> {
  const url = new URL(`${cfg.baseUrl}/wp-json/wc/v3/products`);
  url.searchParams.set("per_page", params.per_page ?? "50");
  url.searchParams.set("status", "publish");
  for (const [key, value] of Object.entries(params)) {
    if (key !== "per_page") url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: cfg.authHeader, Accept: "application/json" },
  });
  if (!res.ok) {
    console.warn("fetchWooProducts: HTTP", res.status, url.pathname + url.search);
    return [];
  }
  const data = (await res.json()) as WooProduct[];
  return Array.isArray(data) ? data : [];
}

function dedupeProducts(products: WooProduct[]): WooProduct[] {
  const seen = new Set<number>();
  const out: WooProduct[] = [];
  for (const p of products) {
    const id = p.id ?? 0;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(p);
  }
  return out;
}

function filterProducts(
  products: WooProduct[],
  parsed: ParsedProductQuery
): WooProduct[] {
  return products.filter((p) => {
    const name = p.name ?? "";
    if (!productMatchesBrand(name, parsed.brandTerms)) return false;
    if (parsed.size && !productMatchesSize(name, parsed.size)) return false;
    return true;
  });
}

function formatProductLine(p: WooProduct): string {
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
}

function formatSearchResults(
  products: WooProduct[],
  parsed: ParsedProductQuery,
  cfg: UrbrandsWooConfig
): string {
  const catalogLink = parsed.catalogUrl
    ? `${cfg.baseUrl}${parsed.catalogUrl}`
    : `${cfg.baseUrl}/categoria-producto/hombre-man/sneakers-sandalias-sneakers-sandals/`;

  const lines = products.slice(0, 8).map(formatProductLine);
  const summary = [
    parsed.brand ? `Marca: ${parsed.brand.toUpperCase()}` : null,
    parsed.productType ? `Tipo: ${parsed.productType}` : null,
    parsed.size ? `Talla: ${parsed.size}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return [
    `PRODUCTOS URBRANDS${summary ? ` (${summary})` : ""} — datos reales del catálogo:`,
    "",
    ...lines,
    "",
    `Ver más en la web: ${catalogLink}`,
    "INSTRUCCIÓN: Comparte estos productos con el cliente. NO digas que no hay stock si aparecen resultados arriba.",
  ].join("\n");
}

/**
 * Consulta WooCommerce con estrategias múltiples (categoría + talla + marca).
 * La API `search=LV sandalias` suele devolver vacío aunque el sitio web sí tenga stock.
 */
export async function searchUrbrandsProductsMarkdown(
  search: string
): Promise<string> {
  const query = search.trim();
  if (!query) {
    return "Falta el texto de búsqueda (marca + tipo + talla, ej: 'LV sandalias 39').";
  }

  const cfg = getUrbrandsWooConfig();
  const parsed = parseProductQuery(query);
  const sizeTermId = parsed.size ? SIZE_ATTRIBUTE_TERMS[parsed.size] : undefined;

  // Estrategia prioritaria: categoría + atributo talla (+ filtro marca en nombre)
  if (parsed.categoryIds.length && sizeTermId) {
    let fromAttribute: WooProduct[] = [];
    for (const catId of parsed.categoryIds) {
      const batch = await fetchWooProducts(cfg, {
        category: String(catId),
        attribute: "pa_talla",
        attribute_term: String(sizeTermId),
        per_page: "50",
      });
      fromAttribute.push(...batch);
    }
    fromAttribute = dedupeProducts(fromAttribute);
    const brandMatches = parsed.brandTerms.length
      ? fromAttribute.filter((p) =>
          productMatchesBrand(p.name ?? "", parsed.brandTerms)
        )
      : fromAttribute;

    if (brandMatches.length) {
      return formatSearchResults(brandMatches, parsed, cfg);
    }
  }

  let collected: WooProduct[] = [];

  // Estrategia 2: categoría + search por marca
  if (parsed.brandTerms.length && parsed.categoryIds.length) {
    for (const catId of parsed.categoryIds) {
      const batch = await fetchWooProducts(cfg, {
        category: String(catId),
        search: parsed.brandTerms[0],
        per_page: "30",
      });
      collected.push(...batch);
    }
  }

  // Estrategia 3: solo search por marca (sin tipo en el query — evita resultados vacíos)
  if (parsed.brandTerms.length) {
    const batch = await fetchWooProducts(cfg, {
      search: parsed.brandTerms[0],
      per_page: "30",
    });
    collected.push(...batch);
  }

  // Estrategia 4: búsqueda literal original (fallback)
  if (!collected.length) {
    const batch = await fetchWooProducts(cfg, { search: query, per_page: "20" });
    collected.push(...batch);
  }

  collected = dedupeProducts(collected);
  let filtered = filterProducts(collected, parsed);

  // Productos obtenidos con filtro de atributo pa_talla: confiar en la API, no exigir T39 en el nombre
  if (!filtered.length && parsed.brandTerms.length && sizeTermId && collected.length) {
    filtered = collected.filter((p) =>
      productMatchesBrand(p.name ?? "", parsed.brandTerms)
    );
  }

  // Si aún no hay match exacto por talla en nombre, mostrar solo marca dentro de la categoría
  if (!filtered.length && collected.length && parsed.brandTerms.length) {
    filtered = collected.filter((p) =>
      productMatchesBrand(p.name ?? "", parsed.brandTerms)
    );
  }

  const catalogLink = parsed.catalogUrl
    ? `${cfg.baseUrl}${parsed.catalogUrl}`
    : `${cfg.baseUrl}/categoria-producto/hombre-man/sneakers-sandalias-sneakers-sandals/`;

  if (!filtered.length) {
    return [
      `No encontré productos exactos para "${query}" tras consultar el catálogo WooCommerce.`,
      `Se probaron categoría${parsed.size ? " + talla " + parsed.size : ""}${parsed.brand ? " + marca " + parsed.brand.toUpperCase() : ""}.`,
      `Catálogo web para explorar: ${catalogLink}`,
      "Si no hay coincidencia exacta, ofrece Por Encargo SOLO después de confirmar que no hay opciones similares en el catálogo.",
    ].join("\n");
  }

  return formatSearchResults(filtered, parsed, cfg);
}
