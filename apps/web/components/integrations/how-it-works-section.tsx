"use client";

import { Link2, ShieldCheck, Zap } from "lucide-react";

const STEPS = [
  {
    icon: Link2,
    title: "Conecta tu servicio",
    description: "Selecciona una integración y añade tus credenciales o API keys de forma segura.",
  },
  {
    icon: ShieldCheck,
    title: "Verifica credenciales",
    description: "El sistema valida la conexión y habilita las funcionalidades asociadas automáticamente.",
  },
  {
    icon: Zap,
    title: "Funciones habilitadas",
    description: "Las páginas y características vinculadas a esa integración quedan activas de inmediato.",
  },
];

interface HowItWorksSectionProps {
  primaryColor?: string;
}

export function HowItWorksSection({ primaryColor = "#dc2626" }: HowItWorksSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 sm:p-8">
      <h2 className="mb-2 text-lg font-semibold text-slate-900">
        ¿Cómo funcionan las integraciones?
      </h2>
      <p className="mb-6 text-sm text-slate-500">
        En tres pasos simples conectas servicios externos y desbloqueas
        funcionalidades del sistema.
      </p>

      <div className="grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div
              key={i}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 transition-all duration-300 hover:shadow-md"
            >
              <div
                className="mb-3 flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors"
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
    </section>
  );
}
