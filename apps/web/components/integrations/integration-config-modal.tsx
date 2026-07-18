"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import type { IntegrationDefinition } from "@/lib/integrations-catalog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Check, Loader2, Link2 } from "lucide-react";

function getWebhookUrl(tenantId: string): string {
  if (typeof window === "undefined") return "";
  const convexUrl =
    (window as unknown as { __CONVEX_URL__?: string }).__CONVEX_URL__ ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    "";
  const siteUrl = convexUrl.replace(".convex.cloud", ".convex.site");
  return `${siteUrl}/webhooks/ycloud/${tenantId}`;
}

function getGoogleCalendarAuthUrl(tenantId: string): string | null {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  const convexUrl =
    (typeof window !== "undefined" && (window as unknown as { __CONVEX_URL__?: string }).__CONVEX_URL__) ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    "";
  const siteUrl = convexUrl.replace(".convex.cloud", ".convex.site");
  const redirectUri = `${siteUrl}/auth/google/calendar/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state: tenantId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface IntegrationConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: IntegrationDefinition | null;
  tenantId: Id<"tenants"> | null;
  primaryColor: string;
  onSuccess?: () => void;
}

export function IntegrationConfigModal({
  open,
  onOpenChange,
  integration,
  tenantId,
  primaryColor,
  onSuccess,
}: IntegrationConfigModalProps) {
  const { user } = useAuth();
  const actorUserId = user?._id as Id<"users"> | undefined;
  const [step, setStep] = useState<"form" | "loading" | "success">("form");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [copied, setCopied] = useState(false);

  const ycloud = useQuery(
    api.integrations.getYCloud,
    tenantId && integration?.id === "ycloud"
      ? { tenantId }
      : "skip"
  );
  const googleCalendar = useQuery(
    api.googleCalendar.get,
    tenantId && integration?.id === "google-calendar"
      ? { tenantId }
      : "skip"
  );
  const saveYCloud = useMutation(api.integrations.saveYCloud);
  const disconnectGoogle = useMutation(api.googleCalendar.disconnect);

  useEffect(() => {
    if (ycloud?.phoneNumber !== undefined) {
      setPhoneInput(ycloud.phoneNumber ?? "");
    }
  }, [ycloud?.phoneNumber]);

  useEffect(() => {
    if (!open) {
      setStep("form");
      setApiKeyInput("");
    }
  }, [open]);

  const webhookUrl = tenantId ? getWebhookUrl(tenantId) : "";

  const handleCopyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnect = async () => {
    if (!tenantId || !actorUserId || integration?.id !== "ycloud") return;

    setStep("loading");

    try {
      await saveYCloud({
        actorUserId,
        tenantId,
        apiKey: apiKeyInput.trim() || undefined,
        phoneNumber: phoneInput.trim() || undefined,
      });
      setStep("success");
      onSuccess?.();
    } catch (e) {
      setStep("form");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  if (!integration) return null;

  const Icon = integration.icon;
  const isYCloud = integration.id === "ycloud";
  const isGoogleCalendar = integration.id === "google-calendar";
  const isImplemented = integration.implemented;

  // Google Calendar: OAuth flow (cada tenant conecta su propio calendario)
  if (isGoogleCalendar && tenantId) {
    const authUrl = getGoogleCalendarAuthUrl(tenantId);
    const connected = googleCalendar?.connected ?? false;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-4">
              <div
                className="flex size-14 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${integration.color}15` }}
              >
                <Icon
                  className="size-7"
                  style={{ color: integration.color }}
                  strokeWidth={2}
                />
              </div>
              <div>
                <DialogTitle className="text-xl">{integration.name}</DialogTitle>
                <DialogDescription>
                  {integration.description} Cada restaurante conecta su propio
                  calendario de Google.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {connected ? (
            <div className="space-y-6 py-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Tu calendario de Google está conectado. Las reservas se
                sincronizarán automáticamente.
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!actorUserId) return;
                  await disconnectGoogle({ actorUserId, tenantId });
                  onSuccess?.();
                  onOpenChange(false);
                }}
                className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100"
              >
                Desconectar Google Calendar
              </button>
            </div>
          ) : authUrl ? (
            <div className="space-y-6 py-2">
              <p className="text-sm text-slate-600">
                Haz clic para autorizar el acceso a tu calendario de Google. Solo
                tú verás y gestionarás tus reservas.
              </p>
              <a
                href={authUrl}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-95"
                style={{ backgroundColor: integration.color }}
              >
                <Link2 className="size-4" />
                Conectar con Google
              </a>
              <p className="text-xs text-slate-500">
                Se abrirá la ventana de Google para que autorices el acceso. Las
                credenciales se gestionan de forma segura.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Falta configurar NEXT_PUBLIC_GOOGLE_CLIENT_ID en las variables de
              entorno del proyecto.
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cerrar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (!isImplemented) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-4">
              <div
                className="flex size-14 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${integration.color}15` }}
              >
                <Icon className="size-7" style={{ color: integration.color }} />
              </div>
              <div>
                <DialogTitle className="text-xl">{integration.name}</DialogTitle>
                <DialogDescription>{integration.description}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              Esta integración estará disponible próximamente.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Estamos trabajando para conectarla con el sistema. Mientras tanto,
              puedes explorar otras integraciones activas.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg sm:max-w-xl"
        onPointerDownOutside={(e) => step === "loading" && e.preventDefault()}
      >
        {step === "success" ? (
          <div className="flex flex-col items-center py-8">
            <div
              className="mb-4 flex size-16 items-center justify-center rounded-full animate-in zoom-in duration-500"
              style={{ backgroundColor: `${primaryColor}20` }}
            >
              <Check
                className="size-8"
                style={{ color: primaryColor }}
                strokeWidth={2.5}
              />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              ¡Integración conectada!
            </h3>
            <p className="mt-1 text-center text-sm text-slate-500">
              {integration.name} está configurado correctamente. Las
              funcionalidades asociadas se han habilitado.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-6 rounded-xl px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-4">
                <div
                  className="flex size-14 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${integration.color}15` }}
                >
                  <Icon
                    className="size-7"
                    style={{ color: integration.color }}
                    strokeWidth={2}
                  />
                </div>
                <div>
                  <DialogTitle className="text-xl">{integration.name}</DialogTitle>
                  <DialogDescription>
                    {integration.description} Configura las credenciales a
                    continuación.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6 py-2">
              {/* Pasos numerados */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">
                  Pasos para conectar:
                </p>
                <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
                  <li>Copia la URL del webhook en el panel de YCloud</li>
                  <li>Introduce tu API Key de YCloud Console</li>
                  <li>Ingresa el número de WhatsApp a conectar</li>
                  <li>Envía un mensaje de prueba para validar</li>
                </ol>
              </div>

              {/* Webhook URL */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Webhook URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookUrl || "Cargando…"}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-mono text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={handleCopyWebhook}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  API Key de YCloud
                </label>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    ycloud?.hasApiKey
                      ? "•••••••• (dejar en blanco para mantener)"
                      : "Introduce tu API Key"
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  style={{
                    // @ts-expect-error focus border color dynamic
                    "--tw-ring-color": primaryColor,
                  }}
                />
              </div>

              {/* Número de teléfono */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Número de WhatsApp / YCloud
                </label>
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+34 612 345 678"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 transition-colors focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConnect}
                disabled={step === "loading"}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-70"
                )}
                style={{ backgroundColor: primaryColor }}
              >
                {step === "loading" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Conectando…
                  </>
                ) : (
                  "Conectar integración"
                )}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
