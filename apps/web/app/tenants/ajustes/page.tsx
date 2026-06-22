"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { Settings, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { proxiedTenantAssetUrl } from "@/lib/tenant-asset-url";
import { PqrEmailRoutingSection } from "@/components/tenants/PqrEmailRoutingSection";
import type { PqrRoutingRule } from "@/lib/pqr-routing";
import { sileo } from "sileo";

const DEFAULT_PRIMARY = "#197fe6";
const DEFAULT_SECONDARY = "#06b6d4";
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export default function AjustesPage() {
  const { tenantId } = useTenant();
  const [tab, setTab] = React.useState<"general" | "correos">("general");
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
    if (tenant) {
      const emails = (tenant as { pqrNotificationEmails?: string[] }).pqrNotificationEmails ?? [];
      setForm((f) => ({
        ...f,
        name: tenant.name ?? "",
        logoUrl: tenant.logoUrl ?? "",
        logoStorageId: null,
        primaryColor: tenant.primaryColor ?? DEFAULT_PRIMARY,
        secondaryColor: tenant.secondaryColor ?? DEFAULT_SECONDARY,
        address: tenant.address ?? "",
        phone: tenant.phone ?? "",
        pqrNotificationEmails: emails.join("\n"),
      }));
    }
  }, [tenant]);

  const primaryColor = tenant?.primaryColor ?? DEFAULT_PRIMARY;
  const pqrEnabled = tenant?.enabledModules?.pqr !== false;
  const pqrRouting = (tenant as { pqrEmailRouting?: PqrRoutingRule[] } | undefined)
    ?.pqrEmailRouting;

  const handleSaveRouting = async (routing: PqrRoutingRule[]) => {
    if (!tenantId) return;
    await updateTenant({ tenantId, pqrEmailRouting: routing });
  };
  const rawDisplayLogoUrl =
    form.logoStorageId ? (uploadPreviewUrl ?? null) : form.logoUrl || (tenant?.logoUrl ?? "");
  const displayLogoUrl = rawDisplayLogoUrl
    ? proxiedTenantAssetUrl(rawDisplayLogoUrl) ?? rawDisplayLogoUrl
    : "";

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
      setLogoError(err instanceof Error ? err.message : "Error al subir el logo");
    } finally {
      setLogoUploading(false);
      e.target.value = "";
      fileInputRef.current && (fileInputRef.current.value = "");
    }
  };

  const removeLogo = () => setForm((f) => ({ ...f, logoUrl: "", logoStorageId: null }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    setSaving(true);
    setSaved(false);
    try {
      const emails = form.pqrNotificationEmails
        .split(/[\n,;]+/)
        .map((e) => e.trim())
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
        description: err instanceof Error ? err.message : "No se pudo guardar.",
      });
    } finally {
      setSaving(false);
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
      <div className="mx-auto w-full max-w-2xl flex-1 p-6 sm:p-8 md:p-10">
        <header className="mb-8">
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            <Settings className="size-8" strokeWidth={1.5} />
            Ajustes
          </h1>
          <p className="mt-2 text-base text-slate-500 sm:text-lg">
            Logo, información, colores y correos de PQR
          </p>
        </header>

        <div className="mb-6 flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setTab("general")}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
              tab === "general"
                ? "border-current text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
            style={tab === "general" ? { borderColor: primaryColor, color: primaryColor } : undefined}
          >
            <Settings className="size-4" />
            General
          </button>
          {pqrEnabled && (
            <button
              type="button"
              onClick={() => setTab("correos")}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px",
                tab === "correos"
                  ? "border-current text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
              style={tab === "correos" ? { borderColor: primaryColor, color: primaryColor } : undefined}
            >
              <Mail className="size-4" />
              Correos PQR
            </button>
          )}
        </div>

        {tab === "correos" && pqrEnabled ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
            <PqrEmailRoutingSection
              primaryColor={primaryColor}
              initialRouting={pqrRouting}
              onSave={handleSaveRouting}
            />
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nombre del restaurante *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej. Taco Parado"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <label className="block text-sm font-medium text-slate-700">Logo del restaurante</label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              onChange={handleLogoChange}
              disabled={logoUploading}
              className="hidden"
              aria-label="Subir logo"
            />
            {(displayLogoUrl || form.logoStorageId) ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative size-16 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {displayLogoUrl && (
                    <img
                      src={displayLogoUrl}
                      alt="Logo"
                      className="size-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  {form.logoStorageId && !displayLogoUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-xs text-slate-500">
                      Cargando…
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={logoUploading}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {logoUploading ? "Subiendo…" : "Cambiar logo"}
                  </button>
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="text-left text-sm text-slate-500 underline hover:text-red-600"
                  >
                    Quitar logo
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoUploading}
                  className="w-fit rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {logoUploading ? "Subiendo…" : "Subir logo"}
                </button>
                <p className="text-xs text-slate-500">PNG, JPEG, WebP o SVG. Tamaño recomendado &lt; 2 MB.</p>
              </div>
            )}
            {logoError && <p className="text-sm text-red-600">{logoError}</p>}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Color primario</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-transparent p-1"
                />
                <input
                  type="text"
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 font-mono text-sm text-slate-900"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Color secundario</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.secondaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, secondaryColor: e.target.value }))}
                  className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 bg-transparent p-1"
                />
                <input
                  type="text"
                  value={form.secondaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, secondaryColor: e.target.value }))}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 font-mono text-sm text-slate-900"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Dirección</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Calle 123, ciudad"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Teléfono</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+57 300 123 4567"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Correos para notificación de PQRs</label>
            <p className="mb-2 text-xs text-slate-500">
              Al crear una PQR (petición, queja o reclamo), se enviará un correo con la información a estas direcciones. Una por línea o separadas por coma.
            </p>
            <textarea
              value={form.pqrNotificationEmails}
              onChange={(e) => setForm((f) => ({ ...f, pqrNotificationEmails: e.target.value }))}
              placeholder="admin@restaurante.com&#10;gerencia@restaurante.com"
              rows={3}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className={cn(
                "rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-md transition-all",
                saved && "bg-emerald-600"
              )}
              style={!saved ? { backgroundColor: primaryColor } : undefined}
            >
              {saving ? "Guardando…" : saved ? "Guardado" : "Guardar cambios"}
            </button>
            {saved && (
              <span className="text-sm text-emerald-600">Cambios aplicados</span>
            )}
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
