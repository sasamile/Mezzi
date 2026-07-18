"use client";

import Link from "next/link";
import { AlertCircle, Link2 } from "lucide-react";

interface IntegrationBlockedBannerProps {
  message: string;
  integrationName?: string;
  primaryColor?: string;
}

export function IntegrationBlockedBanner({
  message,
  integrationName = "la integración requerida",
  primaryColor = "#dc2626",
}: IntegrationBlockedBannerProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <AlertCircle className="size-5 text-amber-600" strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-medium text-amber-900">{message}</p>
          <p className="mt-0.5 text-xs text-amber-700">
            Conecta {integrationName} para habilitar esta funcionalidad.
          </p>
        </div>
      </div>
      <Link
        href="/tenants/integraciones"
        className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: primaryColor }}
      >
        <Link2 className="size-4" strokeWidth={2} />
        Ir a Integraciones
      </Link>
    </div>
  );
}
