import { isPdfsModuleEnabled } from "@/lib/alcarbon";

type ModuleKey = "pqr" | "pedidos" | "reservas" | "conocimiento" | "trabajaConNosotros" | "pdfs";

/** Páginas del tenant que se pueden restringir por usuario */
export const PERMISSION_PAGES = [
  { key: "dashboard", label: "Dashboard", group: "General", module: undefined as ModuleKey | undefined },
  { key: "inbox", label: "Inbox", group: "General", module: undefined as ModuleKey | undefined },
  { key: "reservas", label: "Reservas", group: "General", module: "reservas" as ModuleKey },
  { key: "pedidos", label: "Pedidos", group: "General", module: "pedidos" as ModuleKey },
  { key: "pqrs", label: "PQRs", group: "General", module: "pqr" as ModuleKey },
  { key: "trabajaConNosotros", label: "Trabaja con Nosotros", group: "General", module: "trabajaConNosotros" as ModuleKey },
  { key: "clientes", label: "Clientes", group: "General", module: undefined as ModuleKey | undefined },
  { key: "knowledge", label: "Conocimiento", group: "Conocimiento", module: "conocimiento" as ModuleKey },
  { key: "menu", label: "Documentos PDF", group: "Conocimiento", module: "pdfs" as ModuleKey },
  { key: "aprendizaje", label: "Aprendizaje", group: "Conocimiento", module: "conocimiento" as ModuleKey },
  { key: "integraciones", label: "Integraciones", group: "Integraciones", module: undefined as ModuleKey | undefined },
  { key: "users", label: "Usuarios", group: "Usuarios", module: undefined as ModuleKey | undefined },
] as const;

export type PermissionPageKey = (typeof PERMISSION_PAGES)[number]["key"];

export function getVisiblePermissionPages(
  enabledModules?: {
    pqr?: boolean;
    pedidos?: boolean;
    reservas?: boolean;
    conocimiento?: boolean;
    trabajaConNosotros?: boolean;
    pdfs?: boolean;
  },
  tenant?: { customDomain?: string | null; name?: string | null } | null,
  host?: string | null
) {
  if (!enabledModules && !tenant && !host) return [...PERMISSION_PAGES];
  return PERMISSION_PAGES.filter((p) => {
    if (p.module === "pdfs") {
      return isPdfsModuleEnabled(enabledModules, tenant, host);
    }
    if (!p.module) return true;
    return enabledModules?.[p.module] !== false;
  });
}
