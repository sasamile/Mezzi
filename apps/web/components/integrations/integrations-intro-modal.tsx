"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Link2, ShieldCheck, Zap } from "lucide-react";

const STORAGE_KEY = "integraciones-intro-seen";

const STEPS = [
  {
    icon: Link2,
    title: "Conecta tu servicio",
    description:
      "Selecciona una integración y añade tus credenciales o API keys de forma segura.",
  },
  {
    icon: ShieldCheck,
    title: "Verifica credenciales",
    description:
      "El sistema valida la conexión y habilita las funcionalidades asociadas automáticamente.",
  },
  {
    icon: Zap,
    title: "Funciones habilitadas",
    description:
      "Las páginas y características vinculadas a esa integración quedan activas de inmediato.",
  },
];

interface IntegrationsIntroModalProps {
  primaryColor?: string;
}

export function IntegrationsIntroModal({
  primaryColor = "#dc2626",
}: IntegrationsIntroModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) setOpen(true);
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, "true");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl"
        showClose={true}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">
            ¿Qué son las integraciones?
          </DialogTitle>
          <DialogDescription className="text-base">
            En tres pasos simples conectas servicios externos y desbloqueas
            funcionalidades del sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-3 mt-4">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={i}
                className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-4"
              >
                <div
                  className="mb-3 flex size-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `${primaryColor}15`,
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
      </DialogContent>
    </Dialog>
  );
}
