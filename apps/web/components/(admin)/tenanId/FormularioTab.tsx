"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import { sileo } from "@/lib/toast";
import { Trash2, Plus, Check, Copy, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { slugifyKey } from "@/lib/tenant-to-form";
import type { FormField } from "@/types/types";

export function FormularioTab({
  tenantId,
  tenantName,
}: {
  tenantId: Id<"tenants">;
  tenantName: string;
}) {
  const { user } = useAuth();
  const actorUserId = user?._id as Id<"users"> | undefined;
  const formConfig = useQuery(api.tenantForm.getConfig, { tenantId });
  const currentShare = useQuery(api.tenantForm.getCurrentShare, { tenantId });
  const lastSubmission = useQuery(api.tenantForm.getLastSubmission, {
    tenantId,
  });
  const saveConfig = useMutation(api.tenantForm.saveConfig);
  const getOrCreateShare = useMutation(api.tenantForm.getOrCreateShare);
  const createNewShare = useMutation(api.tenantForm.createNewShare);
  const createPrompt = useMutation(api.prompts.create);
  const updatePrompt = useMutation(api.prompts.update);
  const updateTenant = useMutation(api.tenants.update);
  const defaultPrompt = useQuery(api.prompts.getDefault, { tenantId });

  const [title, setTitle] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [includeColorTheme, setIncludeColorTheme] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [extraPromptRules, setExtraPromptRules] = useState("");
  const [applyingColors, setApplyingColors] = useState(false);

  useEffect(() => {
    if (formConfig === undefined) return;
    if (formConfig) {
      setTitle(formConfig.title || "Formulario del restaurante");
      setFields(
        formConfig.fields.length
          ? formConfig.fields
          : [
              {
                id: crypto.randomUUID(),
                label: "Nombre del negocio",
                key: "nombre_negocio",
                type: "text",
              },
            ]
      );
      setIncludeColorTheme(formConfig.includeColorTheme ?? false);
    } else {
      setTitle("Formulario del restaurante");
      setFields([
        {
          id: crypto.randomUUID(),
          label: "Nombre del negocio",
          key: "nombre_negocio",
          type: "text",
        },
      ]);
      setIncludeColorTheme(false);
    }
  }, [formConfig?.updatedAt, formConfig?._id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const base = window.location.origin;
    if (currentShare?.token) setShareUrl(`${base}/form/${currentShare.token}`);
    else setShareUrl(null);
  }, [currentShare?.token]);

  const addField = () => {
    const label = "Nuevo campo";
    setFields((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label, key: slugifyKey(label), type: "text" },
    ]);
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  };

  const updateField = (id: string, upd: Partial<FormField>) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...upd };
        if (upd.label !== undefined) next.key = slugifyKey(upd.label);
        return next as FormField;
      })
    );
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await saveConfig({ tenantId, title, fields, includeColorTheme });
      sileo.success({
        title: "Guardado",
        description: "Configuración del formulario guardada.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "Error al guardar.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGetLink = async () => {
    try {
      const { token } = await getOrCreateShare({ tenantId });
      if (typeof window !== "undefined")
        setShareUrl(`${window.location.origin}/form/${token}`);
    } catch (err) {
      sileo.error({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Error al generar enlace.",
      });
    }
  };

  const handleNewLink = async () => {
    try {
      const { token } = await createNewShare({ tenantId });
      if (typeof window !== "undefined")
        setShareUrl(`${window.location.origin}/form/${token}`);
      sileo.success({
        title: "Nuevo enlace",
        description: "Enlace generado. El anterior ya no sirve.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description: err instanceof Error ? err.message : "Error.",
      });
    }
  };

  const handleGeneratePromptFromResponses = async () => {
    if (!lastSubmission?.responses) return;
    setGeneratingPrompt(true);
    try {
      let parsed: Record<string, string>;
      try {
        parsed = JSON.parse(lastSubmission.responses) as Record<string, string>;
      } catch {
        sileo.error({ title: "Error", description: "Respuestas no válidas." });
        return;
      }
      const { primaryColor: _p, secondaryColor: _s, ...rest } = parsed;
      const context = Object.entries(rest)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      const base = `Eres el asistente virtual del restaurante "${tenantName}". Usa la siguiente información del negocio para personalizar tus respuestas:\n\n${context}`;
      const promptText = extraPromptRules.trim()
        ? `${base}\n\n--- Reglas o instrucciones adicionales ---\n${extraPromptRules.trim()}`
        : base;
      if (defaultPrompt) {
        await updatePrompt({ id: defaultPrompt._id, prompt: promptText });
      } else {
        await createPrompt({
          tenantId,
          name: "Prompt base",
          prompt: promptText,
          isDefault: true,
        });
      }
      sileo.success({
        title: "Prompt generado",
        description:
          "Se creó/actualizó el prompt base con las respuestas del formulario.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Error al generar prompt.",
      });
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    sileo.success({
      title: "¡Copiado!",
      description: "Enlace copiado al portapapeles.",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const lastSubmissionResponses = lastSubmission
    ? (() => {
        try {
          return JSON.parse(lastSubmission.responses) as Record<string, string>;
        } catch {
          return {};
        }
      })()
    : {};
  const submissionPrimary = lastSubmissionResponses.primaryColor;
  const submissionSecondary = lastSubmissionResponses.secondaryColor;
  const hasSubmissionColors = Boolean(submissionPrimary || submissionSecondary);
  const restEntries = Object.entries(lastSubmissionResponses).filter(
    ([k]) => k !== "primaryColor" && k !== "secondaryColor"
  );

  const handleApplyColors = async () => {
    if (!hasSubmissionColors || !actorUserId) return;
    setApplyingColors(true);
    try {
      await updateTenant({
        actorUserId,
        tenantId,
        ...(submissionPrimary && { primaryColor: submissionPrimary }),
        ...(submissionSecondary && { secondaryColor: submissionSecondary }),
      });
      sileo.success({
        title: "Colores actualizados",
        description:
          "Los colores del restaurante se aplicaron desde la última respuesta.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Error al aplicar colores.",
      });
    } finally {
      setApplyingColors(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="animate-in fade-in duration-300">
        <h3 className="text-xl font-semibold text-[#0F172A]">
          Formulario personalizado
        </h3>
        <p className="mt-2 text-sm text-[#64748B]">
          Configura los campos, comparte el enlace para recibir una respuesta y
          genera el prompt del asistente con esas respuestas (y reglas extra si
          quieres).
        </p>
      </div>

      <section className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.04)] duration-300 sm:p-8">
        <h4 className="mb-1 text-base font-semibold text-[#0F172A]">
          Campos del formulario
        </h4>
        <p className="mb-4 text-xs text-[#64748B]">
          La clave se genera automáticamente desde la etiqueta.
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#64748B]">
              Título del formulario
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-[#E2E8F0] px-4 py-2.5 text-sm text-[#0F172A] transition-colors placeholder:text-[#94A3B8] focus:border-[#EF4444] focus:outline-none focus:ring-2 focus:ring-[#EF4444]/20"
              placeholder="Ej: Datos del negocio"
            />
          </div>
          <div className="space-y-3">
            {fields.map((f, i) => (
              <div
                key={f.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] p-3 transition-all duration-200 hover:border-[#E2E8F0] hover:bg-white"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9] text-xs font-medium text-[#64748B]">
                  {i + 1}
                </span>
                <input
                  type="text"
                  value={f.label}
                  onChange={(e) => updateField(f.id, { label: e.target.value })}
                  placeholder="Etiqueta del campo"
                  className="min-w-[140px] flex-1 rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#EF4444] focus:outline-none focus:ring-2 focus:ring-[#EF4444]/20"
                />
                <select
                  value={f.type}
                  onChange={(e) =>
                    updateField(f.id, {
                      type: e.target.value as "text" | "textarea",
                    })
                  }
                  className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#EF4444] focus:outline-none"
                >
                  <option value="text">Texto corto</option>
                  <option value="textarea">Texto largo</option>
                </select>
                <button
                  type="button"
                  onClick={() => removeField(f.id)}
                  className="rounded-lg p-2 text-[#64748B] transition-colors hover:bg-[#FEE2E2] hover:text-[#DC2626]"
                  aria-label="Quitar campo"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addField}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#E2E8F0] py-3 text-sm font-medium text-[#64748B] transition-all duration-200 hover:border-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            >
              <Plus className="h-4 w-4" /> Añadir campo
            </button>
          </div>
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <input
              type="checkbox"
              id="includeColorTheme"
              checked={includeColorTheme}
              onChange={(e) => setIncludeColorTheme(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-[#E2E8F0] text-[#EF4444] focus:ring-[#EF4444]"
            />
            <label
              htmlFor="includeColorTheme"
              className="text-sm text-[#0F172A]"
            >
              Incluir selector de colores del negocio en el formulario público
              (el usuario elegirá color primario y secundario y verá una vista
              previa en vivo de cómo se vería la plataforma).
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSaveConfig}
          disabled={saving}
          className="mt-6 rounded-xl bg-[#EF4444] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#DC2626] hover:shadow-md active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar configuración"}
        </button>
      </section>

      <section className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.04)] duration-300 delay-75 sm:p-8">
        <h4 className="mb-1 flex items-center gap-2 text-base font-semibold text-[#0F172A]">
          <Link2 className="h-4 w-4 text-[#64748B]" /> Enlace público
        </h4>
        <p className="mb-4 text-xs text-[#64748B]">
          Válido una sola vez. Tras enviar el formulario deberás generar un
          nuevo enlace si quieres otra respuesta.
        </p>
        {shareUrl ? (
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="min-w-0 flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-sm text-[#0F172A]"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all duration-200 active:scale-[0.98]",
                copied
                  ? "border-[#10B981] bg-[#DCFCE7] text-[#166534]"
                  : "border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F1F5F9]"
              )}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>¡Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copiar</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleNewLink}
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
            >
              Generar nuevo enlace
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleGetLink}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F172A] px-5 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-[#334155] active:scale-[0.98]"
          >
            <Link2 className="h-4 w-4" /> Generar enlace
          </button>
        )}
      </section>

      {lastSubmission && (
        <section className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.04)] duration-300 delay-100 sm:p-8">
          <h4 className="mb-3 text-base font-semibold text-[#0F172A]">
            Última respuesta guardada
          </h4>
          <div className="space-y-2 rounded-xl bg-[#F8FAFC] p-4 text-sm">
            {restEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="shrink-0 font-medium text-[#64748B]">
                  {k}:
                </span>
                <span className="text-[#0F172A]">{String(v)}</span>
              </div>
            ))}
            {hasSubmissionColors && (
              <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-[#E2E8F0] bg-white p-3">
                <span className="text-xs font-medium text-[#64748B]">
                  Colores enviados:
                </span>
                {submissionPrimary && (
                  <div className="flex items-center gap-2">
                    <span
                      className="h-6 w-6 rounded-md border border-[#E2E8F0] shadow-inner"
                      style={{ backgroundColor: submissionPrimary }}
                      title={submissionPrimary}
                    />
                    <span className="text-xs text-[#0F172A]">
                      {submissionPrimary}
                    </span>
                  </div>
                )}
                {submissionSecondary && (
                  <div className="flex items-center gap-2">
                    <span
                      className="h-6 w-6 rounded-md border border-[#E2E8F0] shadow-inner"
                      style={{ backgroundColor: submissionSecondary }}
                      title={submissionSecondary}
                    />
                    <span className="text-xs text-[#0F172A]">
                      {submissionSecondary}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleApplyColors}
                  disabled={applyingColors}
                  className="ml-auto rounded-xl bg-[#0F172A] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#334155] disabled:opacity-50"
                >
                  {applyingColors
                    ? "Aplicando..."
                    : "Aplicar colores al restaurante"}
                </button>
              </div>
            )}
          </div>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#0F172A]">
                Reglas o instrucciones adicionales (opcional)
              </label>
              <textarea
                value={extraPromptRules}
                onChange={(e) => setExtraPromptRules(e.target.value)}
                placeholder="Ej: Responde siempre en tono formal. No ofrezcas descuentos sin autorización. Menciona el horario de atención al final."
                rows={4}
                className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#EF4444] focus:outline-none focus:ring-2 focus:ring-[#EF4444]/20"
              />
            </div>
            <button
              type="button"
              onClick={handleGeneratePromptFromResponses}
              disabled={generatingPrompt}
              className="rounded-xl bg-[#10B981] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#059669] hover:shadow-md active:scale-[0.98] disabled:opacity-50"
            >
              {generatingPrompt
                ? "Generando..."
                : "Generar prompt desde respuestas"}
            </button>
          </div>
        </section>
      )}

      {formConfig && !lastSubmission && (
        <p className="text-sm text-[#64748B]">
          Aún no hay respuestas. Comparte el enlace para que rellenen el
          formulario.
        </p>
      )}
    </div>
  );
}
