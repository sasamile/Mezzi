"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { sileo } from "@/lib/toast";
import type { TenantStatus } from "../types/types";
import { DEFAULT_RESTAURANTE_FORM, type RestauranteFormState } from "../types/types";

export type TenantWithPlan = {
  _id: Id<"tenants">;
  name: string;
  status: TenantStatus;
  planId: Id<"plans"> | null;
  customDomain?: string | null;
  planName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  enabledModules?: {
    pqr?: boolean;
    pedidos?: boolean;
    reservas?: boolean;
    conocimiento?: boolean;
  } | null;
};

export function useRestaurantesPage() {
  const { user } = useAuth();
  const actorUserId = user?._id as Id<"users"> | undefined;
  const tenants = useQuery(api.tenants.listWithPlans) as TenantWithPlan[] | undefined;
  const plans = useQuery(api.plans.list);
  const createTenant = useMutation(api.tenants.create);
  const updateTenant = useMutation(api.tenants.update);
  const removeTenant = useMutation(api.tenants.remove);
  const createPrompt = useMutation(api.prompts.create);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"tenants"> | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<Id<"tenants"> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<TenantStatus | "">("");
  const [filterPlanId, setFilterPlanId] = useState<string>("");
  const [form, setForm] = useState<RestauranteFormState>(DEFAULT_RESTAURANTE_FORM);

  const filteredTenants = useMemo(() => {
    if (!tenants) return [];
    let list = tenants;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (filterStatus) {
      list = list.filter((t) => t.status === filterStatus);
    }
    if (filterPlanId) {
      list = list.filter((t) => (t.planId ?? "") === filterPlanId);
    }
    return list;
  }, [tenants, searchQuery, filterStatus, filterPlanId]);

  const stats = useMemo(() => {
    if (!tenants) return { total: 0, active: 0, trial: 0, cancelled: 0 };
    return {
      total: tenants.length,
      active: tenants.filter((t) => t.status === "active").length,
      trial: tenants.filter((t) => t.status === "trial").length,
      cancelled: tenants.filter((t) => t.status === "cancelled").length,
    };
  }, [tenants]);

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_RESTAURANTE_FORM);
    setShowModal(true);
  };

  const openEdit = (t: TenantWithPlan) => {
    setEditingId(t._id);
    setForm({
      name: t.name,
      status: t.status,
      planId: t.planId ?? "",
      customDomain: t.customDomain ?? "",
      primaryColor: t.primaryColor ?? "#dc2626",
      secondaryColor: t.secondaryColor ?? "#fef2f2",
      logoUrl: t.logoUrl ?? "",
      address: t.address ?? "",
      phone: t.phone ?? "",
      defaultPrompt: "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      if (editingId) {
        if (!actorUserId) return;
        await updateTenant({
          actorUserId,
          tenantId: editingId,
          name: form.name,
          status: form.status,
          planId: form.planId || undefined,
          customDomain: form.customDomain.trim() || undefined,
          primaryColor: form.primaryColor || undefined,
          secondaryColor: form.secondaryColor || undefined,
          logoUrl: form.logoUrl || undefined,
          address: form.address || undefined,
          phone: form.phone || undefined,
        });
      } else {
        const tenantId = await createTenant({
          name: form.name,
          status: form.status,
          planId: form.planId || undefined,
          customDomain: form.customDomain.trim() || undefined,
          primaryColor: form.primaryColor || undefined,
          secondaryColor: form.secondaryColor || undefined,
          logoUrl: form.logoUrl || undefined,
          address: form.address || undefined,
          phone: form.phone || undefined,
        });
        if (form.defaultPrompt.trim()) {
          await createPrompt({
            tenantId,
            name: "Prompt base",
            prompt: form.defaultPrompt,
            isDefault: true,
          });
        }
      }
      setShowModal(false);
      sileo.success({
        title: editingId ? "Restaurante actualizado" : "Restaurante creado",
        description: editingId ? "Los cambios se guardaron correctamente." : "El restaurante fue creado con éxito.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo guardar.",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await removeTenant({ tenantId: deleteTargetId });
      setDeleteTargetId(null);
      sileo.success({
        title: "Restaurante eliminado",
        description: "El restaurante fue eliminado correctamente.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo eliminar.",
      });
    }
  };

  return {
    tenants,
    plans,
    filteredTenants,
    stats,
    searchQuery,
    setSearchQuery,
    filterStatus,
    setFilterStatus,
    filterPlanId,
    setFilterPlanId,
    form,
    setForm,
    showModal,
    setShowModal,
    editingId,
    deleteTargetId,
    openCreate,
    openEdit,
    setDeleteTargetId,
    handleSubmit,
    handleDelete,
  };
}
