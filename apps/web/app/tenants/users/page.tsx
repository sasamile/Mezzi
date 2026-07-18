"use client";

import { resolvePrimaryColor } from "@/lib/tenant-theme";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { useRequireOwner } from "@/lib/use-require-owner";
import { sileo } from "@/lib/toast";
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

const USERS_PER_PAGE = 10;

type Member = {
  _id: Id<"userTenants">;
  userId: Id<"users">;
  tenantId: Id<"tenants">;
  role: string;
  allowedPages?: string[];
  allowedFolders?: string[];
  createdAt: number;
  user: { name: string; email: string } | null;
};

export default function UsersPage() {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { isOwner, ready } = useRequireOwner();
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
    tenantId && isOwner ? { tenantId } : "skip"
  );
  const folders = useQuery(
    api.conversationFolders.listByTenant,
    tenantId && isOwner ? { tenantId } : "skip"
  );

  const createUser = useMutation(api.users.create);
  const inviteToTenant = useMutation(api.users.inviteToTenant);
  const updateRole = useMutation(api.users.updateRole);
  const updatePermissions = useMutation(api.users.updatePermissions);
  const updateFolderPermissions = useMutation(api.users.updateFolderPermissions);
  const updateMemberProfile = useMutation(api.users.updateMemberProfile);
  const removeFromTenant = useMutation(api.users.removeFromTenant);

  const primaryColor = resolvePrimaryColor(tenant?.primaryColor);
  const memberships = (members ?? []) as Member[];
  const actorUserId = user?._id as Id<"users"> | undefined;

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

  const handleSaveUser = async (data: {
    userId: Id<"users">;
    userTenantId: Id<"userTenants">;
    name: string;
    email: string;
    password?: string;
    role: "OWNER" | "ADMIN" | "AGENT" | "VIEWER" | "HR";
    allowedPages: string[];
    allowedFolders: string[] | undefined;
  }) => {
    if (!actorUserId || !tenantId) return;
    try {
      await updateMemberProfile({
        actorUserId,
        tenantId,
        userId: data.userId,
        name: data.name,
        email: data.email,
        password: data.password,
      });
      await updateRole({
        actorUserId,
        userTenantId: data.userTenantId,
        role: data.role,
      });
      await updatePermissions({
        actorUserId,
        userTenantId: data.userTenantId,
        allowedPages: data.allowedPages,
      });
      await updateFolderPermissions({
        actorUserId,
        userTenantId: data.userTenantId,
        allowedFolders: data.allowedFolders,
      });
      sileo.success({
        title: "Usuario actualizado",
        description: "Datos, rol y permisos guardados correctamente.",
      });
      setChangeRoleMember(null);
    } catch (err) {
      sileo.error({
        title: "Error",
        description:
          err instanceof Error ? err.message : "No se pudo actualizar.",
      });
      throw err;
    }
  };

  const handleCreateUser = async (data: CreateUserFormData) => {
    if (!tenantId || !actorUserId) return;
    try {
      const userId = await createUser({
        actorUserId,
        tenantId,
        name: data.name.trim(),
        email: data.email.trim(),
        password: data.password,
      });
      await inviteToTenant({
        actorUserId,
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
    if (!removeMemberId || !actorUserId) return;
    try {
      await removeFromTenant({
        actorUserId,
        userTenantId: removeMemberId,
      });
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

  if (!ready || !isOwner) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-full flex-col overflow-y-auto bg-muted/40"
      style={{ "--primaryColor": primaryColor } as React.CSSProperties}
    >
      <div className="w-full flex-1 p-4 md:p-6 lg:p-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Usuarios & Permisos
              </h1>
              <p className="mt-2 text-base text-muted-foreground sm:text-lg">
                Gestiona quién puede acceder y qué puede hacer dentro de este restaurante.
              </p>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
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
              className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar usuario…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="activity">Ordenar por actividad</option>
              <option value="name">Ordenar por nombre</option>
            </select>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr,minmax(320px,380px)]">
          {/* User list */}
          <section>
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Usuarios con acceso
                </h2>
              </div>
              <div className="space-y-3 p-4 sm:p-5">
                {members === undefined ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Cargando…
                  </div>
                ) : filteredAndSorted.length === 0 ? (
                  searchQuery || roleFilter !== "all" ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
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
                      <div className="flex flex-col items-center justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
                        <p className="text-sm text-muted-foreground">
                          {(safePage - 1) * USERS_PER_PAGE + 1}–
                          {Math.min(safePage * USERS_PER_PAGE, totalItems)} de {totalItems} usuario
                          {totalItems !== 1 ? "s" : ""}
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={safePage <= 1}
                            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50"
                            aria-label="Página anterior"
                          >
                            <ChevronLeft className="size-5" />
                          </button>
                          <span className="flex items-center gap-1 px-2 text-sm text-muted-foreground">
                            Página {safePage} de {totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={safePage >= totalPages}
                            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50"
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
        folders={folders ?? []}
        onCreateUser={handleCreateUser}
      />

      {changeRoleMember && changeRoleMember.user && (
        <ChangeRoleModal
          open={!!changeRoleMember}
          onOpenChange={(open) => !open && setChangeRoleMember(null)}
          userId={changeRoleMember.userId}
          userName={changeRoleMember.user.name ?? "Usuario"}
          userEmail={changeRoleMember.user.email ?? ""}
          currentRole={changeRoleMember.role}
          currentAllowedPages={changeRoleMember.allowedPages}
          currentAllowedFolders={changeRoleMember.allowedFolders}
          folders={folders ?? []}
          enabledModules={tenant?.enabledModules}
          tenant={tenant}
          userTenantId={changeRoleMember._id}
          primaryColor={primaryColor}
          onSave={handleSaveUser}
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
            <AlertDialogAction onClick={handleRemoveAccess}>
              Quitar acceso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
