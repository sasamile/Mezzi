"use client";

import { resolvePrimaryColor } from "@/lib/tenant-theme";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { useRequireOwner } from "@/lib/use-require-owner";
import {
  INTEGRATIONS_CATALOG,
  INTEGRATION_CATEGORIES,
  type IntegrationDefinition,
  type IntegrationStatus,
  type IntegrationCategory,
} from "@/lib/integrations-catalog";
import { IntegrationCard } from "@/components/integrations/integration-card";
import { IntegrationConfigModal } from "@/components/integrations/integration-config-modal";
import { IntegrationsIntroModal } from "@/components/integrations/integrations-intro-modal";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";


function getIntegrationStatus(
  integration: IntegrationDefinition,
  ycloud: { connected?: boolean; hasApiKey?: boolean; phoneNumber?: string | null } | null | undefined,
  googleCalendar: { connected?: boolean } | null | undefined
): IntegrationStatus {
  if (!integration.enabledForUsers) return "coming_soon";

  if (integration.id === "ycloud") {
    if (!ycloud) return "not_connected";
    if (ycloud.connected) return "connected";
    if (ycloud.hasApiKey || ycloud.phoneNumber) return "pending_config";
    return "not_connected";
  }

  if (integration.id === "google-calendar") {
    if (!googleCalendar) return "not_connected";
    if (googleCalendar.connected) return "connected";
    return "not_connected";
  }

  return "coming_soon";
}

export default function IntegracionesPage() {
  const { tenantId } = useTenant();
  const { isOwner, ready } = useRequireOwner();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIntegration, setSelectedIntegration] =
    useState<IntegrationDefinition | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const tenant = useQuery(
    api.tenants.get,
    tenantId && isOwner ? { tenantId } : "skip"
  );
  const ycloud = useQuery(
    api.integrations.getYCloud,
    tenantId && isOwner ? { tenantId } : "skip"
  );
  const googleCalendar = useQuery(
    api.googleCalendar.get,
    tenantId && isOwner ? { tenantId } : "skip"
  );

  const primaryColor = resolvePrimaryColor(tenant?.primaryColor);

  const filteredBySearch = useMemo(() => {
    if (!searchQuery.trim()) return INTEGRATIONS_CATALOG;
    const q = searchQuery.toLowerCase().trim();
    return INTEGRATIONS_CATALOG.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        INTEGRATION_CATEGORIES[i.category].label.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<IntegrationCategory, IntegrationDefinition[]> = {
      messaging: [],
      calendar: [],
      storage: [],
      ai: [],
      payments: [],
    };
    for (const i of filteredBySearch) {
      groups[i.category].push(i);
    }
    return groups;
  }, [filteredBySearch]);

  const handleCardClick = (integration: IntegrationDefinition) => {
    if (!integration.enabledForUsers) return;
    setSelectedIntegration(integration);
    setModalOpen(true);
  };

  if (!ready || !isOwner || !tenantId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-full flex-col overflow-y-auto p-6 sm:p-8 md:p-10"
      style={{ "--primaryColor": primaryColor } as React.CSSProperties}
    >
      <div className="w-full">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Centro de Integraciones
          </h1>
          <p className="mt-2 text-base text-muted-foreground sm:text-lg">
            Conecta tus herramientas externas para habilitar funcionalidades del
            sistema.
          </p>
        </header>

        {/* Modal de intro en primera visita */}
        <IntegrationsIntroModal primaryColor={primaryColor} />

        {/* Buscador */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <Search
              className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar integración…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>

        {/* Grid de integraciones por categoría */}
        <div className="mt-10 space-y-10">
          {(Object.keys(groupedByCategory) as IntegrationCategory[]).map(
            (category) => {
              const items = groupedByCategory[category];
              if (items.length === 0) return null;

              const catMeta = INTEGRATION_CATEGORIES[category];
              const CatIcon = catMeta.icon;

              return (
                <section key={category}>
                  <div className="mb-4 flex items-center gap-2">
                    <CatIcon
                      className="size-5 text-muted-foreground"
                      strokeWidth={2}
                    />
                    <h2 className="text-lg font-semibold text-foreground">
                      {catMeta.label}
                    </h2>
                  </div>

                  <div
                    className={cn(
                      "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    )}
                  >
                    {items.map((integration) => (
                      <IntegrationCard
                        key={integration.id}
                        integration={integration}
                        status={getIntegrationStatus(
                          integration,
                          ycloud,
                          googleCalendar
                        )}
                        primaryColor={primaryColor}
                        onClick={() => handleCardClick(integration)}
                      />
                    ))}
                  </div>
                </section>
              );
            }
          )}
        </div>

        {filteredBySearch.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No se encontraron integraciones para &quot;{searchQuery}&quot;
            </p>
          </div>
        )}
      </div>

      {/* Modal de configuración */}
      <IntegrationConfigModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        integration={selectedIntegration}
        tenantId={tenantId}
        primaryColor={primaryColor}
        onSuccess={() => setModalOpen(false)}
      />
    </div>
  );
}
