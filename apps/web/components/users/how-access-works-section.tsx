"use client";

import * as React from "react";
import { UserPlus, Shield, Zap, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TENANT_ROLE_DEFINITIONS } from "@/lib/tenant-role-defaults";
import { ROL_LABELS } from "@/constants";

const STEPS = [
  {
    icon: UserPlus,
    title: "Invitas un usuario",
    description: "Añades una persona por email al restaurante.",
  },
  {
    icon: Shield,
    title: "Le asignas un rol",
    description: "Administrador, operador, solo lectura o talento humano.",
  },
  {
    icon: Zap,
    title: "El sistema controla su acceso",
    description: "Solo ve los módulos permitidos para su rol.",
  },
] as const;

export function HowAccessWorksSection({ primaryColor }: { primaryColor: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/80"
      >
        <span className="font-semibold text-slate-900">¿Cómo funciona el acceso?</span>
        {open ? (
          <ChevronDown className="size-5 text-slate-400" />
        ) : (
          <ChevronRight className="size-5 text-slate-400" />
        )}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-5 py-4 animate-in slide-in-from-top-2 duration-200 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex flex-col rounded-xl border p-4 transition-colors",
                    "border-slate-100 bg-slate-50/50"
                  )}
                >
                  <div
                    className="mb-3 flex size-10 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: `${primaryColor}18`,
                      color: primaryColor,
                    }}
                  >
                    <Icon className="size-5" strokeWidth={2} />
                  </div>
                  <span className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Paso {i + 1}
                  </span>
                  <h3 className="mb-1.5 text-sm font-semibold text-slate-900">
                    {step.title}
                  </h3>
                  <p className="text-sm text-slate-500">{step.description}</p>
                </div>
              );
            })}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Tipos de usuario</h3>
            <ul className="space-y-2">
              {TENANT_ROLE_DEFINITIONS.map((def) => (
                <li
                  key={def.role}
                  className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-sm"
                >
                  <span className="font-semibold text-slate-800">
                    {ROL_LABELS[def.role] ?? def.label}
                  </span>
                  <span className="text-slate-500"> — {def.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
