"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PERMISSION_PAGES, getVisiblePermissionPages } from "@/lib/permissions-pages";
import type { Id } from "@/convex";

const ROLE_OPTIONS = [
  {
    value: "OWNER" as const,
    label: "Owner",
    description: "Acceso total al tenant. Puede gestionar usuarios, configuraciones y eliminarlo.",
  },
  {
    value: "ADMIN" as const,
    label: "Admin",
    description: "Acceso total al tenant excepto transferir propiedad o eliminarlo.",
  },
  {
    value: "AGENT" as const,
    label: "Operador",
    description: "Solo acceso a Inbox, pedidos y conversaciones. No puede editar configuración.",
  },
  {
    value: "VIEWER" as const,
    label: "Solo lectura",
    description: "Puede ver contenido pero no editar ni gestionar usuarios.",
  },
] as const;

interface ChangeRoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  currentRole: string;
  currentAllowedPages?: string[];
  enabledModules?: {
    pqr?: boolean;
    pedidos?: boolean;
    reservas?: boolean;
    conocimiento?: boolean;
    pdfs?: boolean;
  };
  tenant?: { customDomain?: string | null; name?: string | null } | null;
  userTenantId: Id<"userTenants">;
  primaryColor: string;
  onSave: (
    userTenantId: Id<"userTenants">,
    role: "OWNER" | "ADMIN" | "AGENT" | "VIEWER",
    allowedPages: string[]
  ) => Promise<void>;
}

export function ChangeRoleModal({
  open,
  onOpenChange,
  userName,
  currentRole,
  currentAllowedPages,
  enabledModules,
  tenant,
  userTenantId,
  primaryColor,
  onSave,
}: ChangeRoleModalProps) {
  const visiblePages = React.useMemo(
    () =>
      getVisiblePermissionPages(
        enabledModules,
        tenant,
        typeof window !== "undefined" ? window.location.hostname : undefined
      ),
    [enabledModules, tenant]
  );
  const allPageKeys = visiblePages.map((p) => p.key);
  const defaultAllowed = currentAllowedPages?.length ? currentAllowedPages : allPageKeys;
  const [selectedRole, setSelectedRole] = React.useState<string>(currentRole);
  const [allowedPages, setAllowedPages] = React.useState<string[]>(
    defaultAllowed.length > 0
      ? defaultAllowed.filter((k) => (allPageKeys as readonly string[]).includes(k))
      : allPageKeys
  );
  const [saving, setSaving] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSelectedRole(currentRole);
      const keys = visiblePages.map((p) => p.key);
      const next =
        currentAllowedPages?.length
          ? currentAllowedPages.filter((k) => (keys as readonly string[]).includes(k))
          : keys;
      setAllowedPages(next.length > 0 ? next : keys);
      setSuccess(false);
    }
  }, [open, currentRole, currentAllowedPages, visiblePages]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(
        userTenantId,
        selectedRole as "OWNER" | "ADMIN" | "AGENT" | "VIEWER",
        allowedPages
      );
      setSuccess(true);
      setTimeout(() => onOpenChange(false), 400);
    } catch {
      // Error handled by caller
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Cambiar rol</DialogTitle>
          <p className="text-sm text-slate-500">
            Actualiza el rol de <span className="font-medium text-slate-700">{userName}</span>
          </p>
        </DialogHeader>

        <div className="max-h-[55vh] min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="space-y-2 py-2">
          {ROLE_OPTIONS.map((role) => (
            <button
              key={role.value}
              type="button"
              onClick={() => setSelectedRole(role.value)}
              className={cn(
                "w-full rounded-xl border p-4 text-left transition-all duration-200",
                selectedRole === role.value
                  ? "border-2 ring-2 ring-offset-2"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
              )}
              style={
                selectedRole === role.value
                  ? {
                      borderColor: primaryColor,
                      boxShadow: `0 0 0 2px ${primaryColor}40`,
                    }
                  : undefined
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900">{role.label}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{role.description}</p>
                </div>
                {selectedRole === role.value && (
                  <span
                    className="shrink-0 size-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <svg
                      className="size-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </span>
                )}
              </div>
            </button>
          ))}
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4 pb-2">
          <p className="text-sm font-medium text-slate-700">
            Páginas que puede ver
          </p>
          <p className="text-xs text-slate-500">
            Selecciona qué secciones del restaurante puede ver esta persona
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-2">
            {visiblePages.map((page) => (
              <label
                key={page.key}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors text-sm",
                  allowedPages.includes(page.key) ? "bg-slate-100" : "hover:bg-slate-50"
                )}
              >
                <input
                  type="checkbox"
                  checked={allowedPages.includes(page.key)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAllowedPages((prev) =>
                      checked
                        ? [...prev, page.key]
                        : prev.filter((k) => k !== page.key)
                    );
                  }}
                  className="size-4 rounded"
                />
                <span className="text-slate-700">{page.label}</span>
              </label>
            ))}
          </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "transition-all duration-300",
              success && "scale-95 opacity-90"
            )}
            style={
              selectedRole !== currentRole && !saving
                ? {
                    backgroundColor: primaryColor,
                  }
                : undefined
            }
          >
            {saving ? "Guardando…" : success ? "¡Listo!" : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
