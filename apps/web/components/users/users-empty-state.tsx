"use client";

import { UserPlus, Users } from "lucide-react";

interface UsersEmptyStateProps {
  primaryColor: string;
  onInvite: () => void;
}

export function UsersEmptyState({
  primaryColor,
  onInvite,
}: UsersEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16">
      <div
        className="mb-4 flex size-14 items-center justify-center rounded-xl"
        style={{
          backgroundColor: `${primaryColor}15`,
          color: primaryColor,
        }}
      >
        <Users className="size-7" strokeWidth={1.5} />
      </div>
      <h3 className="mb-2 text-base font-semibold text-foreground">
        No hay usuarios aún
      </h3>
      <p className="mb-6 max-w-sm text-center text-sm text-muted-foreground">
        Crea usuarios para tu restaurante. Indica nombre, correo y contraseña
        para cada persona.
      </p>
      <button
        type="button"
        onClick={onInvite}
        className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white"
        style={{ backgroundColor: primaryColor }}
      >
        <UserPlus size={16} strokeWidth={1.7} />
        Crear usuario
      </button>
    </div>
  );
}
