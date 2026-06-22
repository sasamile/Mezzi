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
import { PERMISSION_PAGES, getVisiblePermissionPages } from "@/lib/permissions-pages";
import { defaultPagesForRole } from "@/lib/tenant-role-defaults";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = [
  { value: "OWNER" as const, label: "Owner", description: "Propietario del restaurante" },
  { value: "ADMIN" as const, label: "Admin", description: "Acceso total" },
  { value: "AGENT" as const, label: "Operador", description: "Inbox y pedidos" },
  { value: "VIEWER" as const, label: "Solo lectura", description: "Solo visualización" },
  { value: "HR" as const, label: "Talento Humano", description: "Solo módulo Trabaja con Nosotros" },
] as const;

type Role = (typeof ROLE_OPTIONS)[number]["value"];

export interface CreateUserFormData {
  name: string;
  email: string;
  password: string;
  role: Role;
  allowedPages: string[];
}

interface InviteUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryColor: string;
  enabledModules?: {
    pqr?: boolean;
    pedidos?: boolean;
    reservas?: boolean;
    conocimiento?: boolean;
    pdfs?: boolean;
  };
  tenant?: { customDomain?: string | null; name?: string | null } | null;
  onCreateUser: (data: CreateUserFormData) => Promise<void>;
}

export function InviteUserModal({
  open,
  onOpenChange,
  primaryColor,
  enabledModules,
  tenant,
  onCreateUser,
}: InviteUserModalProps) {
  const visiblePages = React.useMemo(
    () =>
      getVisiblePermissionPages(
        enabledModules,
        tenant,
        typeof window !== "undefined" ? window.location.hostname : undefined
      ),
    [enabledModules, tenant]
  );
  const defaultAllowed = visiblePages.map((p) => p.key);
  const [form, setForm] = React.useState<CreateUserFormData>({
    name: "",
    email: "",
    password: "",
    role: "AGENT",
    allowedPages: defaultAllowed,
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setForm({
        name: "",
        email: "",
        password: "",
        role: "AGENT",
        allowedPages: visiblePages.map((p) => p.key),
      });
    }
  }, [open, visiblePages]);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) return;
    setSaving(true);
    try {
      await onCreateUser(form);
      onOpenChange(false);
    } catch {
      // Error handled by caller
    } finally {
      setSaving(false);
    }
  };

  const isValid = form.name.trim().length > 0 && form.email.trim().length > 0 && form.password.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Crear usuario</DialogTitle>
          <p className="text-sm text-slate-500">
            Crea un nuevo usuario para este restaurante. Ingresa nombre, email y contraseña.
          </p>
        </DialogHeader>

        <div className="max-h-[55vh] min-h-0 flex-1 space-y-4 overflow-y-auto py-2 overscroll-contain">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Nombre
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Juan Pérez"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Correo electrónico
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="email@ejemplo.com"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Rol
            </label>
            <select
              value={form.role}
              onChange={(e) => {
                const role = e.target.value as Role;
                const pageKeys = visiblePages.map((p) => p.key);
                setForm((f) => ({
                  ...f,
                  role,
                  allowedPages: defaultPagesForRole(role, pageKeys),
                }));
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">
              Páginas que puede ver
            </p>
            {form.role === "HR" ? (
              <p className="text-sm text-slate-600 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                Solo <strong>Trabaja con Nosotros</strong> (configuración automática para Talento Humano).
              </p>
            ) : (
            <>
            <p className="mb-3 text-xs text-slate-500">
              Selecciona qué secciones del restaurante puede ver esta persona
            </p>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-2">
              {visiblePages.map((page) => (
                <label
                  key={page.key}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors text-sm",
                    form.allowedPages.includes(page.key) ? "bg-slate-100" : "hover:bg-slate-50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={form.allowedPages.includes(page.key)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((f) => ({
                        ...f,
                        allowedPages: checked
                          ? [...f.allowedPages, page.key]
                          : f.allowedPages.filter((k) => k !== page.key),
                      }));
                    }}
                    className="size-4 rounded"
                  />
                  <span className="text-slate-700">{page.label}</span>
                </label>
              ))}
            </div>
            </>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || saving}
            style={isValid && !saving ? { backgroundColor: primaryColor } : undefined}
          >
            {saving ? "Creando…" : "Crear usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
