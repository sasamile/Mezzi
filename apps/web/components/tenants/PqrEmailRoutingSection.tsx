"use client";

import * as React from "react";
import { Mail, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  defaultRoutingFormRows,
  routingFromTenant,
  routingToPayload,
  type PqrRoutingFormRow,
  type PqrRoutingRule,
} from "@/lib/pqr-routing";

type Props = {
  primaryColor: string;
  initialRouting?: PqrRoutingRule[] | null;
  onSave: (routing: PqrRoutingRule[]) => Promise<void>;
};

export function PqrEmailRoutingSection({
  primaryColor,
  initialRouting,
  onSave,
}: Props) {
  const [rows, setRows] = React.useState<PqrRoutingFormRow[]>(() =>
    routingFromTenant(initialRouting)
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setRows(routingFromTenant(initialRouting));
  }, [initialRouting]);

  const updateRow = (
    rowKey: PqrRoutingFormRow["rowKey"],
    field: "to" | "cc",
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, [field]: value } : r))
    );
    setSaved(false);
  };

  const handleRestoreDefaults = () => {
    setRows(defaultRoutingFormRows());
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await onSave(routingToPayload(rows));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Mail className="size-5" strokeWidth={1.7} />
            Correos por categoría de PQR
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Cada tipo de solicitud se envía al correo correspondiente. Separa varios
            correos con coma. El cliente recibe copia (CC) si dejó email en la PQR.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRestoreDefaults}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw className="size-4" />
          Restaurar plantilla
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.rowKey}
            className="rounded-xl border border-slate-200 bg-slate-50/40 p-4"
          >
            <p className="mb-3 text-sm font-semibold text-slate-800">{row.label}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Para (destinatarios) *
                </label>
                <input
                  type="text"
                  value={row.to}
                  onChange={(e) => updateRow(row.rowKey, "to", e.target.value)}
                  placeholder="correo@empresa.com"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Copia (CC) — opcional
                </label>
                <input
                  type="text"
                  value={row.cc}
                  onChange={(e) => updateRow(row.rowKey, "cc", e.target.value)}
                  placeholder="copia@empresa.com"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md transition-all disabled:opacity-60",
            saved && "bg-emerald-600"
          )}
          style={!saved ? { backgroundColor: primaryColor } : undefined}
        >
          {saving ? "Guardando…" : saved ? "Correos guardados" : "Guardar correos"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600">Configuración aplicada</span>
        )}
      </div>
    </form>
  );
}
