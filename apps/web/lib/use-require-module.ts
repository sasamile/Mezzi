"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { isPdfsModuleEnabled } from "@/lib/alcarbon";

type ModuleKey = "pqr" | "pedidos" | "reservas" | "conocimiento" | "trabajaConNosotros" | "pdfs";

/**
 * Redirige a /tenants si el módulo no está habilitado para el tenant actual.
 * Usar en páginas que requieren un módulo específico.
 */
export function useRequireModule(moduleKey: ModuleKey) {
  const router = useRouter();
  const { tenantId } = useTenant();
  const tenant = useQuery(
    api.tenants.get,
    tenantId ? { tenantId } : "skip"
  );

  useEffect(() => {
    if (!tenantId || tenant === undefined) return;
    if (!tenant) {
      router.replace("/tenants");
      return;
    }
    const host =
      typeof window !== "undefined" ? window.location.hostname : undefined;
    const enabled =
      moduleKey === "pdfs"
        ? isPdfsModuleEnabled(tenant.enabledModules, tenant, host)
        : tenant.enabledModules?.[moduleKey] !== false;
    if (!enabled) {
      router.replace("/tenants");
    }
  }, [tenant, tenantId, moduleKey, router]);
}
