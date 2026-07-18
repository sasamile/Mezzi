"use client";

import * as React from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  defaultRoutingFormRows,
  routingFromTenant,
  routingToPayload,
  type PqrRoutingFormRow,
  type PqrRoutingRule,
} from "@/lib/pqr-routing";
import {
  SettingsField,
  settingsControlClass,
} from "@/components/settings/settings-field";
import { sileo } from "@/lib/toast";

type Props = {
  primaryColor: string;
  initialRouting?: PqrRoutingRule[] | null;
  onSave: (routing: PqrRoutingRule[]) => Promise<void>;
  /** Cuando va dentro de SettingsSection — oculta el encabezado duplicado. */
  embedded?: boolean;
};

export function PqrEmailRoutingSection({
  primaryColor,
  initialRouting,
  onSave,
  embedded = false,
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
      sileo.success({
        title: "Correos guardados",
        description: "El enrutamiento de PQR se actualizó correctamente.",
      });
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      sileo.error({
        title: "Error al guardar",
        description:
          err instanceof Error ? err.message : "No se pudo guardar.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {!embedded && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Correos por categoría de PQR
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Cada tipo de solicitud se envía al correo correspondiente. El
              cliente recibe copia (CC) si dejó email en la PQR.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw size={14} strokeWidth={1.7} />
            Restaurar plantilla
          </button>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.rowKey}
            className="rounded-lg border border-border bg-muted/30 p-4"
          >
            <p className="mb-3 text-sm font-medium text-foreground">
              {row.label}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <SettingsField
                id={`${row.rowKey}-to`}
                label="Para"
                required
              >
                <input
                  id={`${row.rowKey}-to`}
                  type="text"
                  value={row.to}
                  onChange={(e) =>
                    updateRow(row.rowKey, "to", e.target.value)
                  }
                  placeholder="correo@empresa.com"
                  className={settingsControlClass}
                />
              </SettingsField>
              <SettingsField id={`${row.rowKey}-cc`} label="Copia (CC)">
                <input
                  id={`${row.rowKey}-cc`}
                  type="text"
                  value={row.cc}
                  onChange={(e) =>
                    updateRow(row.rowKey, "cc", e.target.value)
                  }
                  placeholder="copia@empresa.com"
                  className={settingsControlClass}
                />
              </SettingsField>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white transition-opacity disabled:opacity-60",
            saved && "bg-emerald-600"
          )}
          style={
            !saved ? { backgroundColor: primaryColor } : undefined
          }
        >
          {saving ? (
            <>
              <Loader2 size={15} className="animate-spin" strokeWidth={1.7} />
              Guardando…
            </>
          ) : saved ? (
            <>
              <Check size={15} strokeWidth={2} />
              Guardado
            </>
          ) : (
            "Guardar correos"
          )}
        </button>
        {embedded && (
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw size={14} strokeWidth={1.7} />
            Restaurar plantilla
          </button>
        )}
        {saved && (
          <span className="text-sm text-muted-foreground">
            Configuración aplicada
          </span>
        )}
      </div>
    </form>
  );
}
