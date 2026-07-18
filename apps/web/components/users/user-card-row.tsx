"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex";
import { MoreHorizontal, UserMinus, Mail, Shield } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  AGENT: "Operador",
  VIEWER: "Solo lectura",
};

function getInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatRelativeTime(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return "Activo ahora";
  if (sec < 3600) return `Activo hace ${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `Activo hace ${Math.floor(sec / 3600)}h`;
  if (sec < 604800) return `Hace ${Math.floor(sec / 86400)}d`;
  return `Hace ${Math.floor(sec / 604800)} sem`;
}

interface Member {
  _id: Id<"userTenants">;
  userId: Id<"users">;
  tenantId: Id<"tenants">;
  role: string;
  createdAt: number;
  user: { name: string; email: string } | null;
}

interface UserCardRowProps {
  member: Member;
  primaryColor: string;
  status?: "active" | "pending" | "disabled";
  onChangeRole: (member: Member) => void;
  onRemoveAccess: (member: Member) => void;
  onResendInvite?: (member: Member) => void;
  onViewPermissions?: (member: Member) => void;
}

export function UserCardRow({
  member,
  primaryColor,
  status = "active",
  onRemoveAccess,
  onResendInvite,
  onViewPermissions,
  onChangeRole,
}: UserCardRowProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-4 rounded-xl border border-border bg-background px-5 py-4 transition-colors duration-150",
        "hover:bg-muted/50"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="relative shrink-0">
          <div
            className="flex size-11 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{
              background: `linear-gradient(135deg, ${primaryColor} 0%, color-mix(in srgb, ${primaryColor} 80%, white) 100%)`,
            }}
          >
            {getInitials(member.user?.name)}
          </div>
          {status === "active" && (
            <span
              className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-background bg-emerald-500"
              title="Activo"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-foreground">
              {member.user?.name ?? "—"}
            </span>
            {member.role === "OWNER" && (
              <span
                className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                style={{
                  backgroundColor: `${primaryColor}22`,
                  color: primaryColor,
                }}
              >
                Propietario
              </span>
            )}
            {status === "pending" && (
              <span className="shrink-0 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                Pendiente
              </span>
            )}
            {status === "disabled" && (
              <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Sin acceso
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {member.user?.email ?? "—"}
          </p>
        </div>
      </div>

      <div className="shrink-0">
        <span
          className={cn(
            "inline-flex rounded-md px-2.5 py-1 text-xs font-medium",
            member.role === "OWNER"
              ? "text-muted-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {ROLE_LABELS[member.role] ?? member.role}
        </span>
      </div>

      <div className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground sm:block">
        {status === "active"
          ? formatRelativeTime(member.createdAt)
          : status === "pending"
            ? "Invitación enviada"
            : "—"}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onChangeRole(member)}
          className="h-8 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          Editar
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Más opciones"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onSelect={() => onRemoveAccess(member)}
            >
              <UserMinus className="size-4" />
              Quitar acceso
            </DropdownMenuItem>
            {onResendInvite && status === "pending" && (
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => onResendInvite(member)}
              >
                <Mail className="size-4" />
                Reenviar invitación
              </DropdownMenuItem>
            )}
            {onViewPermissions && (
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={() => onViewPermissions(member)}
              >
                <Shield className="size-4" />
                Ver permisos
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
