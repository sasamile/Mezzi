import type { PermissionPageKey } from "@/lib/permissions-pages";

export const TENANT_ROLE_DEFINITIONS = [
  {
    role: "OWNER",
    label: "Owner",
    summary: "Acceso total al restaurante, incluyendo usuarios y configuración.",
  },
  {
    role: "ADMIN",
    label: "Administrador",
    summary: "Gestiona operación, integraciones y usuarios (sin transferir propiedad).",
  },
  {
    role: "AGENT",
    label: "Operador",
    summary: "Inbox, pedidos, PQRs y clientes. Ideal para equipo de sala y atención.",
  },
  {
    role: "VIEWER",
    label: "Solo lectura",
    summary: "Puede consultar módulos asignados sin editar configuración ni usuarios.",
  },
  {
    role: "HR",
    label: "Talento humano",
    summary: "Solo el módulo Trabaja con Nosotros (ciudades, sedes y vacantes).",
  },
] as const;

/** Páginas sugeridas al asignar rol (null = todas las visibles según módulos). */
export function defaultPagesForRole(
  role: string,
  visiblePageKeys: PermissionPageKey[]
): PermissionPageKey[] {
  const visible = new Set(visiblePageKeys);
  const pick = (keys: PermissionPageKey[]) =>
    keys.filter((k) => visible.has(k));

  switch (role) {
    case "HR":
      return pick(["trabajaConNosotros"]);
    case "AGENT":
      return pick([
        "dashboard",
        "inbox",
        "pqrs",
        "pedidos",
        "reservas",
        "clientes",
        "trabajaConNosotros",
      ]);
    case "VIEWER":
    case "ADMIN":
    case "OWNER":
    default:
      return [...visiblePageKeys];
  }
}
