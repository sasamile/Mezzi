/** Normaliza host / dominio custom (misma lógica que Convex tenants). */
export function normalizeHost(value?: string | null): string {
  if (!value) return "";
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      ?.split(":")[0] ?? ""
  );
}
