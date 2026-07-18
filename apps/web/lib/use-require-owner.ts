"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";

/**
 * Redirige a /tenants si el usuario actual no es OWNER del tenant.
 * Superadmins del panel SaaS no pasan por aquí (usan /superadmin).
 */
export function useRequireOwner() {
  const router = useRouter();
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const membership = useQuery(
    api.users.getMembershipByTenantAndUser,
    tenantId && user?._id
      ? { tenantId, userId: user._id as Id<"users"> }
      : "skip"
  );

  const isOwner = membership?.role === "OWNER";
  const ready = Boolean(tenantId && user?._id && membership !== undefined);

  useEffect(() => {
    if (!tenantId || !user?._id) {
      router.replace("/tenants");
      return;
    }
    if (membership === undefined) return;
    if (!membership || membership.role !== "OWNER") {
      router.replace("/tenants");
    }
  }, [tenantId, user?._id, membership, router]);

  return { isOwner, ready, membership };
}
