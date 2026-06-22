/** Filas editables de routing PQR (orden importa para trabaja_nosotros). */
export const PQR_ROUTING_ROWS = [
  { rowKey: "calidad_alimentos", module: "calidad_alimentos", label: "Calidad de alimentos y bebidas" },
  { rowKey: "limpieza", module: "limpieza", label: "Limpieza e higiene" },
  { rowKey: "facturacion", module: "facturacion", label: "Facturación y pagos" },
  { rowKey: "domicilios", module: "domicilios", label: "Domicilios" },
  { rowKey: "sugerencias", module: "sugerencias", label: "Sugerencias y felicitaciones" },
  { rowKey: "infraestructura", module: "infraestructura", label: "Infraestructura" },
  {
    rowKey: "trabaja_nosotros_medellin",
    module: "trabaja_nosotros",
    cityMatch: "medellin",
    label: "Trabaja con nosotros — Medellín",
  },
  {
    rowKey: "trabaja_nosotros_otras",
    module: "trabaja_nosotros",
    label: "Trabaja con nosotros — Otras ciudades",
  },
  { rowKey: "proveedores", module: "proveedores", label: "PQRS proveedores" },
] as const;

export type PqrRoutingRowKey = (typeof PQR_ROUTING_ROWS)[number]["rowKey"];

export type PqrRoutingFormRow = {
  rowKey: PqrRoutingRowKey;
  module: string;
  label: string;
  cityMatch?: string;
  to: string;
  cc: string;
};

export type PqrRoutingRule = {
  module: string;
  cityMatch?: string;
  to: string[];
  cc?: string[];
};

/** Plantilla por defecto (Al Carbón). */
export const DEFAULT_PQR_ROUTING: PqrRoutingRule[] = [
  { module: "calidad_alimentos", to: ["servicioalcliente@alcarbonasados.com"] },
  { module: "limpieza", to: ["servicioalcliente@alcarbonasados.com"] },
  { module: "facturacion", to: ["administrativa@alcarbonasados.com"] },
  { module: "domicilios", to: ["servicioalcliente@alcarbonasados.com"] },
  { module: "sugerencias", to: ["servicioalcliente@alcarbonasados.com"] },
  { module: "infraestructura", to: ["servicioalcliente@alcarbonasados.com"] },
  {
    module: "trabaja_nosotros",
    cityMatch: "medellin",
    to: ["auxrecursohumano@alcarbonasados.com"],
    cc: ["recursohumano@alcarbonasados.com"],
  },
  {
    module: "trabaja_nosotros",
    to: ["auxrecursohumano2@alcarbonasados.com"],
    cc: ["recursohumano@alcarbonasados.com"],
  },
  { module: "proveedores", to: ["compras@alcarbonasados.com"] },
];

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

function emailsToField(emails?: string[]): string {
  return (emails ?? []).join(", ");
}

function ruleMatchesRow(
  rule: PqrRoutingRule,
  row: (typeof PQR_ROUTING_ROWS)[number]
): boolean {
  if (rule.module !== row.module) return false;
  const rowCity = row.cityMatch?.toLowerCase();
  const ruleCity = rule.cityMatch?.toLowerCase();
  if (rowCity) return ruleCity === rowCity;
  return !rule.cityMatch;
}

export function routingFromTenant(
  rules?: PqrRoutingRule[] | null
): PqrRoutingFormRow[] {
  const list = rules ?? [];
  return PQR_ROUTING_ROWS.map((row) => {
    const match = list.find((r) => ruleMatchesRow(r, row));
    return {
      rowKey: row.rowKey,
      module: row.module,
      label: row.label,
      cityMatch: row.cityMatch,
      to: emailsToField(match?.to),
      cc: emailsToField(match?.cc),
    };
  });
}

export function routingToPayload(rows: PqrRoutingFormRow[]): PqrRoutingRule[] {
  const out: PqrRoutingRule[] = [];
  for (const row of rows) {
    const to = parseEmails(row.to);
    if (to.length === 0) continue;
    const cc = parseEmails(row.cc);
    out.push({
      module: row.module,
      ...(row.cityMatch ? { cityMatch: row.cityMatch } : {}),
      to,
      ...(cc.length > 0 ? { cc } : {}),
    });
  }
  return out;
}

export function defaultRoutingFormRows(): PqrRoutingFormRow[] {
  return routingFromTenant(DEFAULT_PQR_ROUTING);
}
