"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getVisiblePermissionPages } from "@/lib/permissions-pages";
import { defaultPagesForRole } from "@/lib/tenant-role-defaults";
import { UNCLASSIFIED, folderIcon } from "@/lib/inbox-folders";
import type { Id } from "@/convex";

export interface FolderOption {
  _id: string;
  name: string;
  color?: string;
  icon?: string;
}

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
  {
    value: "HR" as const,
    label: "Talento Humano",
    description: "Solo acceso al módulo Trabaja con Nosotros (vacantes y ubicaciones).",
  },
] as const;

interface ChangeRoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: Id<"users">;
  userName: string;
  userEmail: string;
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
  /** Carpetas del inbox del tenant (para permisos por carpeta). */
  folders?: FolderOption[];
  /** Carpetas permitidas actuales. undefined = todas. */
  currentAllowedFolders?: string[];
  onSave: (data: {
    userId: Id<"users">;
    userTenantId: Id<"userTenants">;
    name: string;
    email: string;
    password?: string;
    role: "OWNER" | "ADMIN" | "AGENT" | "VIEWER" | "HR";
    allowedPages: string[];
    allowedFolders: string[] | undefined;
  }) => Promise<void>;
}

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-muted/40 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ChangeRoleModal({
  open,
  onOpenChange,
  userId,
  userName,
  userEmail,
  currentRole,
  currentAllowedPages,
  enabledModules,
  tenant,
  userTenantId,
  primaryColor,
  folders = [],
  currentAllowedFolders,
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
  const defaultAllowed = currentAllowedPages?.length
    ? currentAllowedPages
    : allPageKeys;
  const [name, setName] = React.useState(userName);
  const [email, setEmail] = React.useState(userEmail);
  const [password, setPassword] = React.useState("");
  const [selectedRole, setSelectedRole] = React.useState<string>(currentRole);
  const [allowedPages, setAllowedPages] = React.useState<string[]>(
    defaultAllowed.length > 0
      ? defaultAllowed.filter((k) =>
          (allPageKeys as readonly string[]).includes(k)
        )
      : allPageKeys
  );
  const [saving, setSaving] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [folderAccessAll, setFolderAccessAll] = React.useState<boolean>(
    currentAllowedFolders === undefined
  );
  const [allowedFolders, setAllowedFolders] = React.useState<string[]>(
    currentAllowedFolders ?? []
  );

  React.useEffect(() => {
    if (open) {
      setName(userName);
      setEmail(userEmail);
      setPassword("");
      setSelectedRole(currentRole);
      const keys = visiblePages.map((p) => p.key);
      const next = currentAllowedPages?.length
        ? currentAllowedPages.filter((k) =>
            (keys as readonly string[]).includes(k)
          )
        : keys;
      setAllowedPages(next.length > 0 ? next : keys);
      setFolderAccessAll(currentAllowedFolders === undefined);
      setAllowedFolders(currentAllowedFolders ?? []);
      setSuccess(false);
    }
  }, [
    open,
    userName,
    userEmail,
    currentRole,
    currentAllowedPages,
    currentAllowedFolders,
    visiblePages,
  ]);

  const seesAllFolders =
    selectedRole === "OWNER" || selectedRole === "ADMIN";
  const inboxAllowed = allowedPages.includes("inbox");
  const showFolderSection =
    !seesAllFolders &&
    selectedRole !== "HR" &&
    inboxAllowed &&
    folders.length > 0;

  const toggleFolder = (key: string, checked: boolean) => {
    setAllowedFolders((prev) =>
      checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)
    );
  };

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    try {
      const foldersToSave =
        seesAllFolders || folderAccessAll ? undefined : allowedFolders;
      await onSave({
        userId,
        userTenantId,
        name: name.trim(),
        email: email.trim(),
        password: password.trim() || undefined,
        role: selectedRole as "OWNER" | "ADMIN" | "AGENT" | "VIEWER" | "HR",
        allowedPages,
        allowedFolders: foldersToSave,
      });
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
      <DialogContent className="flex max-h-[90vh] w-full flex-col overflow-hidden border-border bg-card sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Editar usuario</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Datos de acceso, rol y páginas visibles.
          </p>
        </DialogHeader>

        <div className="scrollbar-none max-h-[55vh] min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-2">
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Nombre
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Nueva contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Dejar vacío para no cambiar"
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Opcional. Mínimo 6 caracteres si la cambias.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Rol</p>
            {ROLE_OPTIONS.map((role) => (
              <button
                key={role.value}
                type="button"
                onClick={() => {
                  setSelectedRole(role.value);
                  const pageKeys = visiblePages.map((p) => p.key);
                  setAllowedPages(defaultPagesForRole(role.value, pageKeys));
                }}
                className={cn(
                  "w-full rounded-xl border p-3.5 text-left transition-colors",
                  selectedRole === role.value
                    ? "border-2"
                    : "border-border hover:bg-muted/40"
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
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{role.label}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {role.description}
                    </p>
                  </div>
                  {selectedRole === role.value && (
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-full"
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

          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">
              Páginas que puede ver
            </p>
            {selectedRole === "HR" ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Talento humano solo accede a{" "}
                <strong className="text-foreground">Trabaja con Nosotros</strong>.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Secciones del panel disponibles para esta persona.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {visiblePages.map((page) => {
                    const checked = allowedPages.includes(page.key);
                    return (
                      <label
                        key={page.key}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                          checked
                            ? "border-border bg-muted/60"
                            : "border-border/60 hover:bg-muted/40"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setAllowedPages((prev) =>
                              on
                                ? [...prev, page.key]
                                : prev.filter((k) => k !== page.key)
                            );
                          }}
                          className="size-4 rounded"
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
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground">
                Carpetas del inbox
              </p>
              <p className="text-xs text-muted-foreground">
                Restringe qué carpetas de chats puede ver esta persona.
              </p>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                  folderAccessAll
                    ? "border-border bg-muted/40"
                    : "border-border hover:bg-muted/40"
                )}
              >
                <input
                  type="checkbox"
                  checked={folderAccessAll}
                  onChange={(e) => setFolderAccessAll(e.target.checked)}
                  className="size-4 rounded"
                  style={{ accentColor: primaryColor }}
                />
                <span className="font-medium text-foreground">
                  Ver todas las carpetas
                </span>
              </label>

              {!folderAccessAll && (
                <div className="space-y-1.5 rounded-xl border border-border p-2">
                  {folders.map((f) => {
                    const Icon = folderIcon(f.icon);
                    const checked = allowedFolders.includes(f._id);
                    return (
                      <label
                        key={f._id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                          checked ? "bg-muted/60" : "hover:bg-muted/40"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            toggleFolder(f._id, e.target.checked)
                          }
                          className="size-4 rounded"
                          style={{ accentColor: primaryColor }}
                        />
                        <Icon
                          size={14}
                          style={{ color: f.color ?? "#64748b" }}
                        />
                        <span className="text-foreground">{f.name}</span>
                      </label>
                    );
                  })}
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                      allowedFolders.includes(UNCLASSIFIED)
                        ? "bg-muted/60"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={allowedFolders.includes(UNCLASSIFIED)}
                      onChange={(e) =>
                        toggleFolder(UNCLASSIFIED, e.target.checked)
                      }
                      className="size-4 rounded"
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
          {seesAllFolders && (
            <p className="border-t border-border pt-4 text-xs text-muted-foreground">
              Este rol ve todas las carpetas del inbox.
            </p>
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
            onClick={handleSave}
            disabled={saving || !name.trim() || !email.trim()}
            className={cn(
              "h-10 rounded-lg px-4 text-sm font-medium text-white transition-opacity disabled:opacity-50",
              success && "opacity-90"
            )}
            style={{ backgroundColor: primaryColor }}
          >
            {saving ? "Guardando…" : success ? "¡Listo!" : "Guardar cambios"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
