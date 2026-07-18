"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { sileo } from "@/lib/toast";

export type PlanFormState = {
  name: string;
  price: number;
  priceAnnual: number;
};

export const DEFAULT_PLAN_FORM: PlanFormState = {
  name: "",
  price: 0,
  priceAnnual: 0,
};

export function usePlanesPage() {
  const plans = useQuery(api.plans.list);
  const tenants = useQuery(api.tenants.listWithPlans);
  const stats = useQuery(api.superadmin.getStats);
  const createPlan = useMutation(api.plans.create);
  const updatePlan = useMutation(api.plans.update);
  const removePlan = useMutation(api.plans.remove);
  const updateTenant = useMutation(api.tenants.update);

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<Id<"plans"> | null>(null);
  const [deleteId, setDeleteId] = useState<Id<"plans"> | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [form, setForm] = useState<PlanFormState>(DEFAULT_PLAN_FORM);

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_PLAN_FORM);
    setShowModal(true);
  };

  const openEdit = (p: NonNullable<typeof plans>[0]) => {
    setEditingId(p._id);
    setForm({
      name: p.name,
      price: p.price,
      priceAnnual: p.priceAnnual ?? p.price * 12,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      if (editingId) {
        await updatePlan({
          planId: editingId,
          name: form.name,
          price: form.price,
          priceAnnual: form.priceAnnual,
        });
        sileo.success({ title: "Plan actualizado", description: "Los cambios se guardaron correctamente." });
      } else {
        await createPlan({
          name: form.name,
          price: form.price,
          priceAnnual: form.priceAnnual,
        });
        sileo.success({ title: "Plan creado", description: "El plan fue creado correctamente." });
      }
      setShowModal(false);
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "Error al guardar." });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await removePlan({ planId: deleteId });
      setDeleteId(null);
      setShowModal(false);
      sileo.success({ title: "Plan eliminado", description: "El plan fue eliminado correctamente." });
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "Error al eliminar." });
    }
  };

  const handleTenantPlanChange = async (tenantId: Id<"tenants">, planId: Id<"plans"> | undefined) => {
    try {
      await updateTenant({ tenantId, planId });
      sileo.success({ title: "Plan actualizado", description: "El plan del restaurante fue actualizado." });
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "Error al actualizar." });
    }
  };

  return {
    plans,
    tenants,
    stats,
    showModal,
    setShowModal,
    editingId,
    deleteId,
    setDeleteId,
    billingPeriod,
    setBillingPeriod,
    form,
    setForm,
    openCreate,
    openEdit,
    handleSubmit,
    handleDelete,
    handleTenantPlanChange,
  };
}
