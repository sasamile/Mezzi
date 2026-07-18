"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import { sileo } from "@/lib/toast";
import { UserPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ROL_LABELS } from "@/constants";

export function AdministradoresTab({
  tenantId,
}: {
  tenantId: Id<"tenants">;
}) {
  const { user } = useAuth();
  const actorUserId = user?._id as Id<"users"> | undefined;
  const members = useQuery(api.users.listByTenant, { tenantId });
  const allUsers = useQuery(api.users.list);
  const inviteToTenant = useMutation(api.users.inviteToTenant);
  const updateRole = useMutation(api.users.updateRole);
  const removeFromTenant = useMutation(api.users.removeFromTenant);
  const createUser = useMutation(api.users.create);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteUserId, setInviteUserId] = useState<Id<"users"> | "">("");
  const [inviteRole, setInviteRole] = useState<"OWNER" | "ADMIN">("ADMIN");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "ADMIN" as "OWNER" | "ADMIN",
  });
  const [removeMemberId, setRemoveMemberId] =
    useState<Id<"userTenants"> | null>(null);

  const existingUserIds = new Set(members?.map((m) => m.userId) ?? []);
  const availableUsers =
    allUsers?.filter((u) => !existingUserIds.has(u._id)) ?? [];

  const handleInvite = async () => {
    if (!inviteUserId || !actorUserId) return;
    try {
      await inviteToTenant({
        actorUserId,
        tenantId,
        userId: inviteUserId,
        role: inviteRole as "OWNER" | "ADMIN",
      });
      setShowInvite(false);
      setInviteUserId("");
      sileo.success({
        title: "Invitación enviada",
        description: "El usuario fue invitado al restaurante.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "Error al invitar.",
      });
    }
  };

  const handleCreateAndInvite = async () => {
    if (!createForm.name.trim() || !createForm.email.trim()) {
      sileo.error({
        title: "Campos obligatorios",
        description: "Nombre y email son obligatorios.",
      });
      return;
    }
    if (!actorUserId) return;
    try {
      const userId = await createUser({
        actorUserId,
        name: createForm.name,
        email: createForm.email,
        password: createForm.password || undefined,
      });
      await inviteToTenant({
        actorUserId,
        tenantId,
        userId,
        role: createForm.role,
      });
      setShowCreate(false);
      setCreateForm({ name: "", email: "", password: "", role: "ADMIN" });
      sileo.success({
        title: "Usuario registrado",
        description: "El administrador fue creado e invitado.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "Error al registrar.",
      });
    }
  };

  const handleRemoveMember = async () => {
    if (!removeMemberId || !actorUserId) return;
    try {
      await removeFromTenant({
        actorUserId,
        userTenantId: removeMemberId,
      });
      setRemoveMemberId(null);
      sileo.success({
        title: "Usuario quitado",
        description: "El usuario fue quitado del restaurante.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "Error al quitar.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold text-[#0F172A]">
          Administradores
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-150 active:scale-[0.98]"
            style={{
              background: "linear-gradient(180deg, #EF4444 0%, #DC2626 100%)",
            }}
          >
            <UserPlus className="h-4 w-4" />
            Agregar administrador
          </button>
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            disabled={availableUsers.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm font-medium text-[#334155] transition-all duration-150 hover:bg-[#F1F5F9] active:scale-[0.98] disabled:opacity-50"
          >
            Invitar existente
          </button>
        </div>
      </div>

      {members === undefined ? (
        <p className="text-sm text-[#64748B]">Cargando...</p>
      ) : members.length === 0 ? (
        <p className="rounded-[16px] border border-[#E2E8F0] bg-[#F8FAFC] p-8 text-center text-sm text-[#64748B]">
          No hay administradores asignados.
        </p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-[16px] border border-[#E2E8F0] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.04)] sm:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#64748B]">
                    Usuario
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-[#64748B]">
                    Rol
                  </th>
                  <th className="w-24 px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[#64748B]">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr
                    key={m._id}
                    className="border-b border-[#E2E8F0] transition-colors duration-150 last:border-0 hover:bg-[#F8FAFC]"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-sm font-semibold text-[#64748B]">
                          {(m.user?.name ?? "?").charAt(0)}
                        </div>
                        <div>
                          <p className="text-[15px] font-semibold text-[#0F172A]">
                            {m.user?.name ?? "—"}
                          </p>
                          <p className="text-[13px] text-[#64748B]">
                            {m.user?.email ?? "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-[#F1F5F9] px-2.5 py-0.5 text-xs font-medium text-[#334155]">
                        {ROL_LABELS[m.role]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <select
                          value={m.role}
                          onChange={async (e) => {
                            try {
                              await updateRole({
                                actorUserId: actorUserId!,
                                userTenantId: m._id,
                                role: e.target
                                  .value as "OWNER" | "ADMIN" | "AGENT" | "VIEWER",
                              });
                              sileo.success({
                                title: "Rol actualizado",
                                description:
                                  "El rol del usuario fue actualizado.",
                              });
                            } catch (err) {
                              sileo.error({
                                title: "Error",
                                description:
                                  err instanceof Error
                                    ? err.message
                                    : "Error al actualizar rol.",
                              });
                            }
                          }}
                          className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1.5 text-xs text-[#334155] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
                        >
                          {(["OWNER", "ADMIN", "AGENT", "VIEWER"] as const).map(
                            (r) => (
                              <option key={r} value={r}>
                                {ROL_LABELS[r]}
                              </option>
                            )
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() => setRemoveMemberId(m._id)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 sm:hidden">
            {members.map((m) => (
              <div
                key={m._id}
                className="flex items-center justify-between rounded-[16px] border border-[#E2E8F0] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-sm font-semibold text-[#64748B]">
                    {(m.user?.name ?? "?").charAt(0)}
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-[#0F172A]">
                      {m.user?.name ?? "—"}
                    </p>
                    <p className="text-[13px] text-[#64748B]">
                      {m.user?.email ?? "—"}
                    </p>
                    <span className="mt-1 inline-flex rounded-full bg-[#F1F5F9] px-2 py-0.5 text-xs font-medium text-[#334155]">
                      {ROL_LABELS[m.role]}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <select
                    value={m.role}
                    onChange={async (e) => {
                      try {
                        await updateRole({
                          actorUserId: actorUserId!,
                          userTenantId: m._id,
                          role: e.target
                            .value as "OWNER" | "ADMIN" | "AGENT" | "VIEWER",
                        });
                        sileo.success({
                          title: "Rol actualizado",
                          description: "El rol del usuario fue actualizado.",
                        });
                      } catch (err) {
                        sileo.error({
                          title: "Error",
                          description:
                            err instanceof Error
                              ? err.message
                              : "Error al actualizar rol.",
                        });
                      }
                    }}
                    className="rounded-lg border border-[#E2E8F0] bg-white px-2 py-1 text-xs"
                  >
                    {(["OWNER", "ADMIN", "AGENT", "VIEWER"] as const).map(
                      (r) => (
                        <option key={r} value={r}>
                          {ROL_LABELS[r]}
                        </option>
                      )
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => setRemoveMemberId(m._id)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748B] hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar nuevo administrador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#334155]">
                Nombre
              </label>
              <input
                type="text"
                placeholder="Nombre"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, name: e.target.value })
                }
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#334155]">
                Email
              </label>
              <input
                type="email"
                placeholder="email@ejemplo.com"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm({ ...createForm, email: e.target.value })
                }
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#334155]">
                Contraseña (opcional)
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm({ ...createForm, password: e.target.value })
                }
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#334155]">
                Rol
              </label>
              <select
                value={createForm.role}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    role: e.target.value as "OWNER" | "ADMIN",
                  })
                }
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
              >
                <option value="OWNER">Propietario</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() =>
                setCreateForm({
                  name: "",
                  email: "",
                  password: "",
                  role: "ADMIN",
                })
              }
            >
              Limpiar
            </Button>
            <Button
              onClick={handleCreateAndInvite}
              className="bg-[#EF4444] hover:bg-[#DC2626]"
            >
              Registrar e invitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitación de usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#334155]">
                Usuario
              </label>
              <select
                value={inviteUserId}
                onChange={(e) =>
                  setInviteUserId(e.target.value as Id<"users"> | "")
                }
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
              >
                <option value="">Seleccionar usuario...</option>
                {availableUsers.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#334155]">
                Rol
              </label>
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "OWNER" | "ADMIN")
                }
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
              >
                <option value="OWNER">Propietario</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowInvite(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleInvite}
              disabled={!inviteUserId}
              className="bg-[#EF4444] hover:bg-[#DC2626] disabled:opacity-50"
            >
              Invitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!removeMemberId}
        onOpenChange={(open) => !open && setRemoveMemberId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Quitar usuario del restaurante?
            </AlertDialogTitle>
            <AlertDialogDescription>
              El usuario dejará de tener acceso a este restaurante. Puedes
              volver a invitarlo más tarde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveMember}
              className="bg-red-600 hover:bg-red-700"
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
