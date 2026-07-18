"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getVisiblePermissionPages } from "@/lib/permissions-pages";
import { defaultPagesForRole } from "@/lib/tenant-role-defaults";
import { UNCLASSIFIED, folderIcon } from "@/lib/inbox-folders";
import { cn } from "@/lib/utils";

export interface FolderOption {
  _id: string;
  name: string;
  color?: string;
  icon?: string;
}

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
  /** Carpetas del inbox permitidas. undefined = todas. */
  allowedFolders?: string[];
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
  folders?: FolderOption[];
  onCreateUser: (data: CreateUserFormData) => Promise<void>;
}

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-muted/40 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function InviteUserModal({
  open,
  onOpenChange,
  primaryColor,
  enabledModules,
  tenant,
  folders = [],
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
  const [form, setForm] = React.useState<CreateUserFormData>({
    name: "",
    email: "",
    password: "",
    role: "AGENT",
    allowedPages: visiblePages.map((p) => p.key),
  });
  const [saving, setSaving] = React.useState(false);
  const [folderAccessAll, setFolderAccessAll] = React.useState(true);
  const [selectedFolders, setSelectedFolders] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) {
      setForm({
        name: "",
        email: "",
        password: "",
        role: "AGENT",
        allowedPages: visiblePages.map((p) => p.key),
      });
      setFolderAccessAll(true);
      setSelectedFolders([]);
    }
  }, [open, visiblePages]);

  const seesAllFolders = form.role === "OWNER" || form.role === "ADMIN";
  const inboxAllowed = form.allowedPages.includes("inbox");
  const showFolderSection =
    !seesAllFolders &&
    form.role !== "HR" &&
    inboxAllowed &&
    folders.length > 0;

  const toggleFolder = (key: string, checked: boolean) => {
    setSelectedFolders((prev) =>
      checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)
    );
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) return;
    setSaving(true);
    try {
      const allowedFolders =
        seesAllFolders || folderAccessAll ? undefined : selectedFolders;
      await onCreateUser({ ...form, allowedFolders });
      onOpenChange(false);
    } catch {
      // Error handled by caller
    } finally {
      setSaving(false);
    }
  };

  const isValid =
    form.name.trim().length > 0 &&
    form.email.trim().length > 0 &&
    form.password.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col overflow-hidden border-border bg-card sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Crear usuario</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Nombre, email, contraseña y páginas que puede ver.
          </p>
        </DialogHeader>

        <div className="scrollbar-none max-h-[55vh] min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Nombre
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Juan Pérez"
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Correo electrónico
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="email@ejemplo.com"
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Contraseña
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
              placeholder="Mínimo 6 caracteres"
              className={fieldClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
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
              className={cn(fieldClass, "appearance-none")}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.description}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">
              Páginas que puede ver
            </p>
            {form.role === "HR" ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                Solo <strong className="text-foreground">Trabaja con Nosotros</strong>{" "}
                (automático para Talento Humano).
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  Secciones del panel disponibles para esta persona.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {visiblePages.map((page) => {
                    const checked = form.allowedPages.includes(page.key);
                    return (
                      <label
                        key={page.key}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                          checked
                            ? "border-border bg-muted/60"
                            : "border-border/60 bg-transparent hover:bg-muted/40"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setForm((f) => ({
                              ...f,
                              allowedPages: on
                                ? [...f.allowedPages, page.key]
                                : f.allowedPages.filter((k) => k !== page.key),
                            }));
                          }}
                          className="size-4 rounded border-border"
                          style={{ accentColor: primaryColor }}
                        />
                        <span className="text-foreground">{page.label}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {showFolderSection && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-foreground">
                Carpetas del inbox
              </p>
              <p className="mb-2 text-xs text-muted-foreground">
                Restringe qué carpetas de chats puede ver (ej. solo Facturas).
              </p>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                  folderAccessAll
                    ? "border-border bg-muted/60"
                    : "border-border/60 hover:bg-muted/40"
                )}
              >
                <input
                  type="checkbox"
                  checked={folderAccessAll}
                  onChange={(e) => setFolderAccessAll(e.target.checked)}
                  className="size-4 rounded border-border"
                  style={{ accentColor: primaryColor }}
                />
                <span className="font-medium text-foreground">
                  Ver todas las carpetas
                </span>
              </label>

              {!folderAccessAll && (
                <div className="mt-2 space-y-1.5 rounded-lg border border-border p-2">
                  {folders.map((f) => {
                    const Icon = folderIcon(f.icon);
                    const checked = selectedFolders.includes(f._id);
                    return (
                      <label
                        key={f._id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                          checked ? "bg-muted" : "hover:bg-muted/40"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleFolder(f._id, e.target.checked)}
                          className="size-4 rounded border-border"
                          style={{ accentColor: primaryColor }}
                        />
                        <Icon size={14} style={{ color: f.color ?? "#64748b" }} />
                        <span className="text-foreground">{f.name}</span>
                      </label>
                    );
                  })}
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                      selectedFolders.includes(UNCLASSIFIED)
                        ? "bg-muted"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFolders.includes(UNCLASSIFIED)}
                      onChange={(e) => toggleFolder(UNCLASSIFIED, e.target.checked)}
                      className="size-4 rounded border-border"
                      style={{ accentColor: primaryColor }}
                    />
                    <span className="italic text-muted-foreground">
                      Sin clasificar
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || saving}
            className="h-10 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50"
            style={
              isValid && !saving
                ? { backgroundColor: primaryColor }
                : { backgroundColor: "var(--muted)" }
            }
          >
            {saving ? "Creando…" : "Crear usuario"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
