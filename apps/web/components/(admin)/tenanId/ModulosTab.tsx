"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { sileo } from "@/lib/toast";
import { TENANT_MODULES } from "@/constants";
import { isPdfsModuleEnabled } from "@/lib/alcarbon";
import { cn } from "@/lib/utils";

type TenantModules = {
  pqr?: boolean;
  pedidos?: boolean;
  reservas?: boolean;
  conocimiento?: boolean;
  trabajaConNosotros?: boolean;
  pdfs?: boolean;
};

export function ModulosTab({
  tenantId,
  enabledModules,
  tenantName,
  customDomain,
}: {
  tenantId: Id<"tenants">;
  enabledModules?: TenantModules | null;
  tenantName?: string;
  customDomain?: string | null;
}) {
  const tenantIdentity = { name: tenantName, customDomain };
  const defaultPdfs = isPdfsModuleEnabled(enabledModules, tenantIdentity);
  const updateTenant = useMutation(api.tenants.update);
  const [modules, setModules] = useState<TenantModules>(() => ({
    pqr: enabledModules?.pqr ?? true,
    pedidos: enabledModules?.pedidos ?? true,
    reservas: enabledModules?.reservas ?? true,
    conocimiento: enabledModules?.conocimiento ?? true,
    trabajaConNosotros: enabledModules?.trabajaConNosotros ?? true,
    pdfs: defaultPdfs,
  }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setModules({
      pqr: enabledModules?.pqr ?? true,
      pedidos: enabledModules?.pedidos ?? true,
      reservas: enabledModules?.reservas ?? true,
      conocimiento: enabledModules?.conocimiento ?? true,
      trabajaConNosotros: enabledModules?.trabajaConNosotros ?? true,
      pdfs: isPdfsModuleEnabled(enabledModules, tenantIdentity),
    });
  }, [enabledModules, tenantName, customDomain]);

  const handleToggle = (key: keyof TenantModules, value: boolean) => {
    setModules((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTenant({ tenantId, enabledModules: modules });
      sileo.success({
        title: "Módulos actualizados",
        description: "Los módulos se guardaron correctamente.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo guardar.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#64748B]">
        Activa o desactiva los módulos que tendrá este restaurante. Los módulos
        desactivados no aparecerán en el menú del tenant ni el Bot podrá
        usarlos en el chat.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {TENANT_MODULES.map((mod) => (
          <div
            key={mod.key}
            className={cn(
              "rounded-xl border p-5 transition-colors",
              modules[mod.key] !== false
                ? "border-emerald-200/80 bg-emerald-50/30"
                : "border-slate-200 bg-slate-50/50"
            )}
          >
            <label className="flex cursor-pointer items-start gap-4">
              <input
                type="checkbox"
                checked={modules[mod.key] !== false}
                onChange={(e) => handleToggle(mod.key, e.target.checked)}
                className="mt-1 size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div>
                <span className="font-semibold text-[#0F172A]">{mod.label}</span>
                <p className="mt-1 text-sm text-[#64748B]">{mod.description}</p>
              </div>
            </label>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-[#dc2626] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#b91c1c] disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
