"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { sileo } from "@/lib/toast";
import { Check } from "lucide-react";

export function PromptTab({ tenantId }: { tenantId: Id<"tenants"> }) {
  const defaultPrompt = useQuery(api.prompts.getDefault, { tenantId });
  const createPrompt = useMutation(api.prompts.create);
  const updatePrompt = useMutation(api.prompts.update);

  const [prompt, setPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (defaultPrompt !== undefined) {
      setPrompt(defaultPrompt?.prompt ?? "");
    }
  }, [defaultPrompt?._id, defaultPrompt?.prompt]);

  const currentText = defaultPrompt?.prompt ?? "";
  const hasChanges = prompt !== currentText;

  const handleSave = async () => {
    const text = prompt.trim();
    if (!text) return;
    setIsSaving(true);
    setSaved(false);
    try {
      if (defaultPrompt) {
        await updatePrompt({ id: defaultPrompt._id, prompt: text });
      } else {
        await createPrompt({
          tenantId,
          name: "Prompt base",
          prompt: text,
          isDefault: true,
        });
      }
      setSaved(true);
      sileo.success({
        title: "Guardado",
        description: "El prompt se guardó correctamente.",
      });
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      sileo.error({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Error al guardar prompt.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-[#0F172A]">
          Configuración del Prompt IA
        </h3>
        <p className="mt-1 text-sm text-[#64748B]">
          Prompt base del asistente virtual para este restaurante. Define el
          tono, contexto y reglas del asistente.
        </p>
      </div>
      {defaultPrompt === undefined ? (
        <p className="text-sm text-[#64748B]">Cargando...</p>
      ) : (
        <>
          <textarea
            rows={12}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Instrucciones del asistente virtual..."
            className="w-full rounded-[16px] bg-[#0F172A] p-5 font-mono text-sm text-[#E2E8F0] placeholder:text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#334155]"
            style={{ caretColor: "#E2E8F0" }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!hasChanges || isSaving}
              onClick={handleSave}
              className="inline-flex items-center rounded-xl bg-[#EF4444] px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
            >
              {isSaving ? "Guardando..." : "Guardar cambios"}
            </button>

            {saved && (
              <span
                className="inline-flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "#10B981" }}
              >
                <Check className="h-4 w-4" />
                Guardado
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
