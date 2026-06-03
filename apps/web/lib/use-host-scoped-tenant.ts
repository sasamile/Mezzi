"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex";
import { useTenant } from "@/lib/tenant-context";

/** En dominios dedicados (ej. urbrands.mezzi.app), fija el tenant del panel. */
export function useHostScopedTenant() {
  const { setTenantId } = useTenant();
  const scopedTenant = useQuery(
    api.tenants.getByHost,
    typeof window !== "undefined" ? { host: window.location.hostname } : "skip"
  );

  useEffect(() => {
    if (scopedTenant) {
      setTenantId(scopedTenant._id);
    }
  }, [scopedTenant, setTenantId]);

  return scopedTenant;
}
