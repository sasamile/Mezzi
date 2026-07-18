"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import { useTenant, setPersistedTenantId } from "@/lib/tenant-context";
import { sileo } from "@/lib/toast";

/**
 * Expulsa la sesión si el usuario ya no existe en BD o perdió
 * todo acceso a restaurantes (p. ej. le quitaron la membresía).
 */
export function useSessionGuard() {
  const router = useRouter();
  const { user, logout, isLoading } = useAuth();
  const { tenantId, setTenantId } = useTenant();
  const kickedRef = useRef(false);

  const dbUser = useQuery(
    api.users.get,
    user?._id && !isLoading ? { userId: user._id as Id<"users"> } : "skip"
  );
  const memberships = useQuery(
    api.users.getTenantsForUser,
    user?._id && !isLoading ? { userId: user._id as Id<"users"> } : "skip"
  );
  const membership = useQuery(
    api.users.getMembershipByTenantAndUser,
    tenantId && user?._id && !isLoading
      ? { tenantId, userId: user._id as Id<"users"> }
      : "skip"
  );
  const scopedTenant = useQuery(
    api.tenants.getByHost,
    typeof window !== "undefined" ? { host: window.location.hostname } : "skip"
  );

  useEffect(() => {
    if (isLoading || !user || kickedRef.current) return;

    // Usuario borrado de la base de datos
    if (dbUser === null) {
      kickedRef.current = true;
      logout();
      setTenantId(null);
      setPersistedTenantId(null);
      sileo.error({
        title: "Sesión finalizada",
        description: "Tu cuenta ya no existe. Vuelve a iniciar sesión.",
      });
      router.replace("/login");
      return;
    }

    if (memberships === undefined) return;

    // Sin ningún restaurante → fuera
    if (memberships.length === 0 && !user.isSuperadmin) {
      kickedRef.current = true;
      logout();
      setTenantId(null);
      setPersistedTenantId(null);
      sileo.error({
        title: "Acceso revocado",
        description:
          "Ya no tienes acceso a ningún restaurante. Contacta al propietario.",
      });
      router.replace("/login");
      return;
    }

    // Dominio dedicado sin membresía en ese tenant
    if (
      scopedTenant &&
      memberships !== undefined &&
      !memberships.some((m) => m.tenantId === scopedTenant._id) &&
      !user.isSuperadmin
    ) {
      kickedRef.current = true;
      logout();
      setTenantId(null);
      setPersistedTenantId(null);
      sileo.error({
        title: "Acceso revocado",
        description: "Ya no tienes acceso a este restaurante.",
      });
      router.replace("/login");
      return;
    }

    // Tenían un tenant seleccionado y les quitaron la membresía
    if (tenantId && membership === null) {
      const other = memberships.find((m) => m.tenantId !== tenantId && m.tenant);
      if (other?.tenant) {
        setTenantId(other.tenant._id);
      } else if (!user.isSuperadmin) {
        kickedRef.current = true;
        logout();
        setTenantId(null);
        setPersistedTenantId(null);
        sileo.error({
          title: "Acceso revocado",
          description: "Te quitaron el acceso a este restaurante.",
        });
        router.replace("/login");
      } else {
        setTenantId(null);
      }
    }
  }, [
    isLoading,
    user,
    dbUser,
    memberships,
    membership,
    tenantId,
    scopedTenant,
    logout,
    setTenantId,
    router,
  ]);
}
