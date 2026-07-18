"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useState } from "react";
import { sileo } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { DEFAULT_RESTAURANTE_FORM, type RestauranteFormState } from "../../../../types/types";
import { RestauranteProfileHeader } from "@/components/(admin)/tenanId/RestauranteProfileHeader";
import { GeneralTab } from "@/components/(admin)/tenanId/GeneralTab";
import { ModulosTab } from "@/components/(admin)/tenanId/ModulosTab";
import { FormularioTab } from "@/components/(admin)/tenanId/FormularioTab";
import { PromptTab } from "@/components/(admin)/tenanId/PromptTab";
import { AdministradoresTab } from "@/components/(admin)/tenanId/AdministradoresTab";
import type { TenantWithPlan } from "@/hook/use-restaurantes-page";
import { tenantToForm } from "@/lib/tenant-to-form";
import { TABS } from "@/constants";
import { RestauranteFormDialog } from "@/components/(admin)/restaurantes/RestauranteFormDialog";


export default function RestauranteDetailPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId as Id<"tenants">;

  const tenants = useQuery(api.tenants.listWithPlans) as
    | TenantWithPlan[]
    | undefined;
  const tenant = tenants?.find((t) => t._id === tenantId);
  const plans = useQuery(api.plans.list);
  const updateTenant = useMutation(api.tenants.update);

  const [activeTab, setActiveTab] = useState<
    "general" | "modulos" | "administradores" | "formulario" | "prompt"
  >("general");
  const [showEditModal, setShowEditModal] = useState(false);
  const [form, setForm] = useState<RestauranteFormState>(
    DEFAULT_RESTAURANTE_FORM
  );

  const openEdit = () => {
    if (!tenant) return;
    setForm(tenantToForm(tenant));
    setShowEditModal(true);
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !tenant) return;
    try {
      await updateTenant({
        tenantId: tenant._id,
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
      setShowEditModal(false);
      sileo.success({
        title: "Restaurante actualizado",
        description: "Los cambios se guardaron correctamente.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo guardar.",
      });
    }
  };

  if (tenants === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-[#64748B]">Cargando restaurante...</p>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-red-600">
          No se encontró el restaurante solicitado.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-[#F8FAFC]">
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-8 md:space-y-10">
          <RestauranteProfileHeader tenant={tenant} onEdit={openEdit} />

          <div className="rounded-[20px] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.04)] sm:rounded-[24px]">
            <div className="overflow-x-auto p-2 sm:p-3">
              <div
                className="flex min-w-0 rounded-xl p-1 sm:inline-flex"
                style={{ backgroundColor: "#F1F5F9" }}
              >
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "relative shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98] sm:px-6",
                      activeTab === tab.id
                        ? "bg-white text-[#0F172A] shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                        : "text-[#64748B] hover:text-[#0F172A]"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 sm:p-8">
              {activeTab === "general" && (
                <GeneralTab tenant={tenant} onEdit={openEdit} />
              )}
              {activeTab === "modulos" && (
                <ModulosTab
                  tenantId={tenant._id}
                  enabledModules={tenant.enabledModules}
                  tenantName={tenant.name}
                  customDomain={tenant.customDomain}
                />
              )}
              {activeTab === "administradores" && (
                <AdministradoresTab tenantId={tenant._id} />
              )}
              {activeTab === "formulario" && (
                <FormularioTab
                  tenantId={tenant._id}
                  tenantName={tenant.name}
                />
              )}
              {activeTab === "prompt" && <PromptTab tenantId={tenant._id} />}
            </div>
          </div>
        </div>
      </div>

      <RestauranteFormDialog
        open={showEditModal}
        onOpenChange={setShowEditModal}
        form={form}
        setForm={setForm}
        editingId={tenant._id}
        plans={plans}
        onSubmit={handleSubmitEdit}
      />
    </div>
  );
}
