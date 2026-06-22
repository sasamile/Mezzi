"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { sileo } from "sileo";
import { Search, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserCardRow } from "@/components/users/user-card-row";
import { ChangeRoleModal } from "@/components/users/change-role-modal";
import { InviteUserModal, type CreateUserFormData } from "@/components/users/invite-user-modal";
import { HowAccessWorksSection } from "@/components/users/how-access-works-section";
import { UsersEmptyState } from "@/components/users/users-empty-state";
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

const DEFAULT_PRIMARY = "#197fe6";
const USERS_PER_PAGE = 10;

type Member = {
  _id: Id<"userTenants">;
  userId: Id<"users">;
  tenantId: Id<"tenants">;
  role: string;
  allowedPages?: string[];
  createdAt: number;
  user: { name: string; email: string } | null;
};

export default function UsersPage() {
  const { tenantId } = useTenant();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState<string>("all");
  const [sortBy, setSortBy] = React.useState<"name" | "activity">("activity");
  const [page, setPage] = React.useState(1);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [changeRoleMember, setChangeRoleMember] = React.useState<Member | null>(null);
  const [removeMemberId, setRemoveMemberId] = React.useState<Id<"userTenants"> | null>(null);

  const tenant = useQuery(
    api.tenants.get,
    tenantId ? { tenantId } : "skip"
  );
  const members = useQuery(
    api.users.listByTenant,
    tenantId ? { tenantId } : "skip"
  );

  const createUser = useMutation(api.users.create);
  const inviteToTenant = useMutation(api.users.inviteToTenant);
  const updateRole = useMutation(api.users.updateRole);
  const updatePermissions = useMutation(api.users.updatePermissions);
  const removeFromTenant = useMutation(api.users.removeFromTenant);

  const primaryColor = tenant?.primaryColor ?? DEFAULT_PRIMARY;
  const memberships = (members ?? []) as Member[];

  const filteredAndSorted = React.useMemo(() => {
    let list = [...memberships];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.user?.name?.toLowerCase().includes(q) ||
          m.user?.email?.toLowerCase().includes(q)
      );
    }
    if (roleFilter !== "all") {
      list = list.filter((m) => m.role === roleFilter);
    }
    if (sortBy === "name") {
      list.sort((a, b) =>
        (a.user?.name ?? "").localeCompare(b.user?.name ?? "")
      );
    } else {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  }, [memberships, searchQuery, roleFilter, sortBy]);

  const totalItems = filteredAndSorted.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / USERS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedList = React.useMemo(
    () =>
      filteredAndSorted.slice(
        (safePage - 1) * USERS_PER_PAGE,
        safePage * USERS_PER_PAGE
      ),
    [filteredAndSorted, safePage]
  );

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, roleFilter, sortBy]);

  const handleSaveRole = async (
    userTenantId: Id<"userTenants">,
    role: "OWNER" | "ADMIN" | "AGENT" | "VIEWER" | "HR",
    allowedPages: string[]
  ) => {
    try {
      await updateRole({ userTenantId, role });
      await updatePermissions({ userTenantId, allowedPages });
      sileo.success({
        title: "Usuario actualizado",
        description: "Rol y permisos guardados correctamente.",
      });
      setChangeRoleMember(null);
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo actualizar el rol.",
      });
      throw err;
    }
  };

  const handleCreateUser = async (data: CreateUserFormData) => {
    if (!tenantId) return;
    try {
      const userId = await createUser({
        name: data.name.trim(),
        email: data.email.trim(),
        password: data.password,
      });
      await inviteToTenant({
        tenantId,
        userId,
        role: data.role,
        allowedPages: data.allowedPages,
      });
      sileo.success({
        title: "Usuario creado",
        description: "El usuario fue creado y tiene acceso a este restaurante.",
      });
      setInviteOpen(false);
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo crear el usuario.",
      });
      throw err;
    }
  };

  const handleRemoveAccess = async () => {
    if (!removeMemberId) return;
    try {
      await removeFromTenant({ userTenantId: removeMemberId });
      sileo.success({
        title: "Acceso quitado",
        description: "El usuario ya no tiene acceso al restaurante.",
      });
      setRemoveMemberId(null);
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "No se pudo quitar el acceso.",
      });
    }
  };

  if (!tenantId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-slate-500">Cargando…</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-full flex-col overflow-y-auto bg-slate-50"
      style={{ "--primaryColor": primaryColor } as React.CSSProperties}
    >
      <div className="mx-auto w-full max-w-6xl flex-1 p-6 sm:p-8 md:p-10">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Usuarios & Permisos
              </h1>
              <p className="mt-2 text-base text-slate-500 sm:text-lg">
                Gestiona quién puede acceder y qué puede hacer dentro de este restaurante.
              </p>
              <p className="mt-2 text-sm font-medium text-slate-600">
                {memberships.length} usuario{memberships.length !== 1 ? "s" : ""} activo
                {memberships.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
              style={{ backgroundColor: primaryColor }}
            >
              <UserPlus className="size-5" strokeWidth={2} />
              Crear usuario
            </button>
          </div>
        </header>

        {/* Search + filters */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm">
            <Search
              className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar usuario…"
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="all">Todos los roles</option>
              {["OWNER", "ADMIN", "AGENT", "VIEWER", "HR"].map((r) => (
                <option key={r} value={r}>
                  {r === "OWNER"
                    ? "Owner"
                    : r === "ADMIN"
                      ? "Admin"
                      : r === "AGENT"
                        ? "Operador"
                        : r === "HR"
                          ? "Talento Humano"
                          : "Solo lectura"}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "name" | "activity")}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="activity">Ordenar por actividad</option>
              <option value="name">Ordenar por nombre</option>
            </select>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr,minmax(320px,380px)]">
          {/* User list */}
          <section>
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-slate-800">
                  Usuarios con acceso
                </h2>
              </div>
              <div className="space-y-3 p-4 sm:p-5">
                {members === undefined ? (
                  <div className="py-12 text-center text-sm text-slate-500">
                    Cargando…
                  </div>
                ) : filteredAndSorted.length === 0 ? (
                  searchQuery || roleFilter !== "all" ? (
                    <div className="py-12 text-center text-sm text-slate-500">
                      No hay usuarios que coincidan con los filtros.
                    </div>
                  ) : (
                    <UsersEmptyState
                      primaryColor={primaryColor}
                      onInvite={() => setInviteOpen(true)}
                    />
                  )
                ) : (
                  <>
                    {paginatedList.map((m) => (
                      <UserCardRow
                        key={m._id}
                        member={m}
                        primaryColor={primaryColor}
                        status="active"
                        onChangeRole={() => setChangeRoleMember(m)}
                        onRemoveAccess={() => setRemoveMemberId(m._id)}
                      />
                    ))}
                    {totalPages > 1 && (
                      <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
                        <p className="text-sm text-slate-500">
                          {(safePage - 1) * USERS_PER_PAGE + 1}–
                          {Math.min(safePage * USERS_PER_PAGE, totalItems)} de {totalItems} usuario
                          {totalItems !== 1 ? "s" : ""}
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={safePage <= 1}
                            className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
                            aria-label="Página anterior"
                          >
                            <ChevronLeft className="size-5" />
                          </button>
                          <span className="flex items-center gap-1 px-2 text-sm text-slate-600">
                            Página {safePage} de {totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={safePage >= totalPages}
                            className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
                            aria-label="Página siguiente"
                          >
                            <ChevronRight className="size-5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Sidebar - permissions sections */}
          <aside className="space-y-4">
            <HowAccessWorksSection primaryColor={primaryColor} />
          </aside>
        </div>
      </div>

      {/* Modals */}
      <InviteUserModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        primaryColor={primaryColor}
        enabledModules={tenant?.enabledModules}
        tenant={tenant}
        onCreateUser={handleCreateUser}
      />

      {changeRoleMember && (
        <ChangeRoleModal
          open={!!changeRoleMember}
          onOpenChange={(open) => !open && setChangeRoleMember(null)}
          userName={changeRoleMember.user?.name ?? "Usuario"}
          currentRole={changeRoleMember.role}
          currentAllowedPages={changeRoleMember.allowedPages}
          enabledModules={tenant?.enabledModules}
          tenant={tenant}
          userTenantId={changeRoleMember._id}
          primaryColor={primaryColor}
          onSave={handleSaveRole}
        />
      )}

      <AlertDialog
        open={!!removeMemberId}
        onOpenChange={(open) => !open && setRemoveMemberId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar acceso?</AlertDialogTitle>
            <AlertDialogDescription>
              El usuario perderá el acceso a este restaurante. Puedes volver a invitarlo más tarde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveAccess}
              className="bg-red-600 hover:bg-red-700"
            >
              Quitar acceso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
