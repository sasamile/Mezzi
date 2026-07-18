"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import {
  resolvePrimaryColor,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
} from "@/lib/tenant-theme";
import { proxiedTenantAssetUrl } from "@/lib/tenant-asset-url";
import { PqrEmailRoutingSection } from "@/components/tenants/PqrEmailRoutingSection";
import type { PqrRoutingRule } from "@/lib/pqr-routing";
import { PageHeader, PageSurface } from "@/components/layout/page-chrome";
import { SettingsSection } from "@/components/settings/settings-section";
import {
  SettingsField,
  settingsControlClass,
  settingsTextareaClass,
} from "@/components/settings/settings-field";
import { LogoUploader } from "@/components/settings/logo-uploader";
import { ColorField } from "@/components/settings/color-field";
import { BrandPreview } from "@/components/settings/brand-preview";
import { SettingsPageSkeleton } from "@/components/settings/settings-page-skeleton";
import { Check, Loader2, Mail, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { sileo } from "@/lib/toast";

const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];

type Tab = "general" | "correos";

export default function AjustesPage() {
  const { tenantId } = useTenant();
  const [tab, setTab] = React.useState<Tab>("general");
  const [form, setForm] = React.useState({
    name: "",
    logoUrl: "",
    logoStorageId: null as Id<"_storage"> | null,
    primaryColor: DEFAULT_PRIMARY,
    secondaryColor: DEFAULT_SECONDARY,
    address: "",
    phone: "",
    pqrNotificationEmails: "",
  });

  const tenant = useQuery(api.tenants.get, tenantId ? { tenantId } : "skip");
  const uploadPreviewUrl = useQuery(
    api.tenants.getStorageUrl,
    form.logoStorageId ? { storageId: form.logoStorageId } : "skip"
  );
  const updateTenant = useMutation(api.tenants.update);
  const generateUploadUrl = useMutation(api.tenants.generateLogoUploadUrl);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [logoUploading, setLogoUploading] = React.useState(false);
  const [logoError, setLogoError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!tenant) return;
    const emails =
      (tenant as { pqrNotificationEmails?: string[] }).pqrNotificationEmails ??
      [];
    setForm((f) => ({
      ...f,
      name: tenant.name ?? "",
      logoUrl: tenant.logoUrl ?? "",
      logoStorageId: null,
      primaryColor: resolvePrimaryColor(tenant.primaryColor),
      secondaryColor: tenant.secondaryColor ?? DEFAULT_SECONDARY,
      address: tenant.address ?? "",
      phone: tenant.phone ?? "",
      pqrNotificationEmails: emails.join("\n"),
    }));
  }, [tenant]);

  const pqrEnabled = tenant?.enabledModules?.pqr !== false;
  const pqrRouting = (
    tenant as { pqrEmailRouting?: PqrRoutingRule[] } | undefined
  )?.pqrEmailRouting;

  const rawDisplayLogoUrl = form.logoStorageId
    ? (uploadPreviewUrl ?? null)
    : form.logoUrl || (tenant?.logoUrl ?? "");
  const displayLogoUrl = rawDisplayLogoUrl
    ? (proxiedTenantAssetUrl(rawDisplayLogoUrl) ?? rawDisplayLogoUrl)
    : "";

  const handleSaveRouting = async (routing: PqrRoutingRule[]) => {
    if (!tenantId) return;
    await updateTenant({ tenantId, pqrEmailRouting: routing });
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setLogoError("Formato no válido. Usa PNG, JPEG, WebP o SVG.");
      return;
    }
    setLogoError(null);
    setLogoUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Error al subir la imagen");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      setForm((f) => ({ ...f, logoStorageId: storageId, logoUrl: "" }));
    } catch (err) {
      setLogoError(
        err instanceof Error ? err.message : "Error al subir el logo"
      );
    } finally {
      setLogoUploading(false);
      e.target.value = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeLogo = () =>
    setForm((f) => ({ ...f, logoUrl: "", logoStorageId: null }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    setSaving(true);
    setSaved(false);
    try {
      const emails = form.pqrNotificationEmails
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await updateTenant({
        tenantId,
        name: form.name.trim() || undefined,
        ...(form.logoStorageId
          ? { logoStorageId: form.logoStorageId }
          : form.logoUrl === ""
            ? { logoUrl: "" }
            : {}),
        primaryColor: form.primaryColor || undefined,
        secondaryColor: form.secondaryColor || undefined,
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        pqrNotificationEmails: emails.length > 0 ? emails : undefined,
      });
      setForm((f) => ({ ...f, logoStorageId: null }));
      setSaved(true);
      sileo.success({
        title: "Ajustes guardados",
        description: "La información del restaurante se actualizó correctamente.",
      });
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      sileo.error({
        title: "Error al guardar",
        description:
          err instanceof Error ? err.message : "No se pudo guardar.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!tenantId) {
    return (
      <PageSurface>
        <SettingsPageSkeleton />
      </PageSurface>
    );
  }

  if (tenant === undefined) {
    return (
      <PageSurface>
        <SettingsPageSkeleton />
      </PageSurface>
    );
  }

  const tabs: { id: Tab; label: string; Icon: typeof Store; show: boolean }[] =
    [
      { id: "general", label: "General", Icon: Store, show: true },
      {
        id: "correos",
        label: "Correos PQR",
        Icon: Mail,
        show: pqrEnabled,
      },
    ];

  return (
    <PageSurface>
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader
          title="Ajustes"
          description="Identidad, marca y notificaciones del restaurante."
        />

        <div
          role="tablist"
          aria-label="Secciones de ajustes"
          className="mb-6 flex w-fit gap-1 rounded-lg border border-border bg-muted/40 p-1"
        >
          {tabs
            .filter((t) => t.show)
            .map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(id)}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon size={15} strokeWidth={1.7} className="shrink-0" />
                  {label}
                </button>
              );
            })}
        </div>

        {tab === "correos" && pqrEnabled ? (
          <SettingsSection
            title="Enrutamiento de correos"
            description="Destinatarios por categoría de PQR. Separa varios correos con coma."
          >
            <PqrEmailRoutingSection
              primaryColor={form.primaryColor}
              initialRouting={pqrRouting}
              onSave={handleSaveRouting}
              embedded
            />
          </SettingsSection>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <SettingsSection
              title="Identidad"
              description="Nombre y logo que se muestran en el panel y al cliente."
            >
              <SettingsField id="tenant-name" label="Nombre del restaurante" required>
                <input
                  id="tenant-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Ej. Al Carbón Asados"
                  className={settingsControlClass}
                />
              </SettingsField>

              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Logo</p>
                <LogoUploader
                  displayUrl={displayLogoUrl}
                  uploading={logoUploading}
                  error={logoError}
                  pendingStorage={Boolean(form.logoStorageId && !displayLogoUrl)}
                  fileInputRef={fileInputRef}
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  onFileChange={handleLogoChange}
                  onPick={() => fileInputRef.current?.click()}
                  onRemove={removeLogo}
                />
              </div>
            </SettingsSection>

            <SettingsSection
              title="Marca"
              description="Colores del panel. El primario marca botones y estados activos."
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <ColorField
                  id="primary-color"
                  label="Color primario"
                  value={form.primaryColor}
                  onChange={(primaryColor) =>
                    setForm((f) => ({ ...f, primaryColor }))
                  }
                />
                <ColorField
                  id="secondary-color"
                  label="Color secundario"
                  value={form.secondaryColor}
                  onChange={(secondaryColor) =>
                    setForm((f) => ({ ...f, secondaryColor }))
                  }
                />
              </div>
              <BrandPreview
                name={form.name}
                primaryColor={form.primaryColor}
                secondaryColor={form.secondaryColor}
                logoUrl={displayLogoUrl || undefined}
              />
            </SettingsSection>

            <SettingsSection
              title="Contacto"
              description="Datos visibles en flujos del restaurante."
            >
              <SettingsField id="tenant-address" label="Dirección">
                <input
                  id="tenant-address"
                  type="text"
                  value={form.address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                  placeholder="Calle 123, ciudad"
                  className={settingsControlClass}
                />
              </SettingsField>
              <SettingsField id="tenant-phone" label="Teléfono">
                <input
                  id="tenant-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  placeholder="+57 300 123 4567"
                  className={settingsControlClass}
                />
              </SettingsField>
            </SettingsSection>

            {pqrEnabled && (
              <SettingsSection
                title="Notificaciones PQR"
                description="Correos que reciben aviso al crear una petición, queja o reclamo."
              >
                <SettingsField
                  id="pqr-emails"
                  label="Destinatarios"
                  description="Una dirección por línea, o separadas por coma."
                >
                  <textarea
                    id="pqr-emails"
                    value={form.pqrNotificationEmails}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        pqrNotificationEmails: e.target.value,
                      }))
                    }
                    placeholder={"admin@restaurante.com\ngerencia@restaurante.com"}
                    rows={3}
                    className={settingsTextareaClass}
                  />
                </SettingsField>
              </SettingsSection>
            )}

            <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-xl border border-border bg-background/95 px-5 py-4 backdrop-blur-sm">
              <button
                type="submit"
                disabled={saving}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white transition-opacity disabled:opacity-60",
                  saved && "bg-emerald-600"
                )}
                style={
                  !saved
                    ? { backgroundColor: form.primaryColor || DEFAULT_PRIMARY }
                    : undefined
                }
              >
                {saving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" strokeWidth={1.7} />
                    Guardando…
                  </>
                ) : saved ? (
                  <>
                    <Check size={15} strokeWidth={2} />
                    Guardado
                  </>
                ) : (
                  "Guardar cambios"
                )}
              </button>
              {saved && (
                <span className="text-sm text-muted-foreground">
                  Cambios aplicados
                </span>
              )}
            </div>
          </form>
        )}
      </div>
    </PageSurface>
  );
}
