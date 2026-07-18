"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useMemo } from "react";
import { useQuery } from "convex/react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { useMutation } from "convex/react";
import { sileo } from "@/lib/toast";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import { allowsSuperadminPanel } from "@/lib/saas-host-access";
import { getLoginBranding } from "@/lib/site-branding";
import { setPersistedTenantId } from "@/lib/tenant-context";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { LoginAtmosphere } from "@/components/login/login-atmosphere";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email({ message: "Ingresa un correo válido" }),
  password: z
    .string()
    .min(5, { message: "La contraseña debe tener al menos 5 caracteres" }),
});

type LoginValues = z.infer<typeof loginSchema>;

const inputClass =
  "h-11 border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 shadow-none focus-visible:border-zinc-400 focus-visible:ring-1 focus-visible:ring-zinc-400";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, login } = useAuth();

  const hostname =
    typeof window !== "undefined"
      ? window.location.hostname.toLowerCase().replace(/^www\./, "")
      : "";
  const canAccessSuperadmin = allowsSuperadminPanel(hostname);

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    const returnUrl = searchParams.get("redirect") ?? searchParams.get("returnUrl");
    const safeReturn =
      returnUrl &&
      returnUrl.startsWith("/") &&
      !returnUrl.startsWith("//") &&
      (!returnUrl.startsWith("/superadmin") || canAccessSuperadmin);
    if (safeReturn) {
      router.replace(returnUrl);
    } else if (user.isSuperadmin && canAccessSuperadmin) {
      router.replace("/superadmin");
    } else {
      router.replace("/tenants");
    }
  }, [user, isLoading, searchParams, router, canAccessSuperadmin]);
  const authLogin = useMutation(api.auth.login);
  const [showPassword, setShowPassword] = useState(false);
  const tenantByHost = useQuery(
    api.tenants.getByHost,
    hostname ? { host: hostname } : "skip"
  );
  const branding = useMemo(
    () => getLoginBranding(hostname, tenantByHost),
    [hostname, tenantByHost]
  );
  const [logoSrc, setLogoSrc] = useState(branding.logoSrc);

  useEffect(() => {
    setLogoSrc(branding.logoSrc);
  }, [branding.logoSrc]);

  const form = useForm<LoginValues>({
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
    setError,
  } = form;

  const onSubmit = async (values: LoginValues) => {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const fieldName = first?.path[0];
      if (fieldName && typeof fieldName === "string") {
        setError(fieldName as keyof LoginValues, {
          type: "manual",
          message: first.message,
        });
      }
      sileo.error({
        title: "Revisa el formulario",
        description: first?.message ?? "Completa los campos correctamente.",
      });
      return;
    }

    try {
      const user = await authLogin({
        ...values,
        host: typeof window !== "undefined" ? window.location.hostname : undefined,
      });
      if (user.forcedTenantId) {
        setPersistedTenantId(user.forcedTenantId as Id<"tenants">);
      }
      login({
        _id: user._id,
        name: user.name,
        email: user.email,
        isSuperadmin: user.isSuperadmin,
      });
      sileo.success({
        title: "Bienvenido",
        description: user.name ? `Hola, ${user.name}` : "Sesión iniciada.",
      });
      if (user.isSuperadmin && canAccessSuperadmin) {
        router.push("/superadmin");
      } else {
        router.push("/tenants");
      }
    } catch (err) {
      const rawMessage =
        err instanceof Error ? err.message : "Error al iniciar sesión";

      const lower = rawMessage.toLowerCase();
      let friendly =
        "Ha ocurrido un error al iniciar sesión. Inténtalo de nuevo.";

      if (
        lower.includes("credenciales inválidas") ||
        lower.includes("invalid credentials")
      ) {
        friendly = "Credenciales inválidas. Verifica tu correo y contraseña.";
      } else if (lower.includes("no tienes acceso a este dominio")) {
        friendly =
          "Tu usuario no tiene acceso a este restaurante. Inicia sesión con un usuario autorizado.";
      }

      sileo.error({
        title: "Error al iniciar sesión",
        description: friendly,
      });
    }
  };

  const accent = branding.accentColor ?? "#dc2626";
  const useSideImage = branding.sidePanel === "image";

  if (isLoading || user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <LoginAtmosphere accentColor={accent} className="absolute inset-0 z-0" />
        <p className="relative z-10 text-sm text-zinc-400">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center px-4 py-10">
      <LoginAtmosphere accentColor={accent} className="absolute inset-0 z-0" />

      <div
        className={cn(
          "relative z-10 w-full overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.55)] [color-scheme:light]",
          useSideImage
            ? "grid max-w-4xl grid-cols-1 md:grid-cols-2"
            : "max-w-[400px]"
        )}
      >
        <div className="flex items-center px-6 py-8 sm:px-8 sm:py-10">
          <div className="w-full space-y-8">
            <div className="space-y-4">
              <div className="flex justify-center">
                <Image
                  src={logoSrc}
                  alt={branding.logoAlt}
                  width={220}
                  height={40}
                  priority
                  unoptimized={logoSrc.startsWith("/")}
                  onError={() => {
                    const fallback = getLoginBranding(hostname, null).logoSrc;
                    if (fallback && fallback !== logoSrc) setLogoSrc(fallback);
                  }}
                  className="h-9 w-auto max-w-[180px] object-contain sm:h-10 sm:max-w-[200px]"
                />
              </div>
              <div className="space-y-1 text-center">
                <h1 className="text-[15px] font-medium tracking-tight text-zinc-900">
                  Iniciar sesión
                </h1>
                <p className="text-[13px] text-zinc-500">{branding.subtitle}</p>
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[13px] font-medium text-zinc-700">
                        Correo electrónico
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="tu@restaurante.com"
                          autoComplete="email"
                          className={inputClass}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[13px] font-medium text-zinc-700">
                        Contraseña
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            className={cn(inputClass, "pr-10")}
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute inset-y-0 right-3 flex items-center justify-center text-zinc-400 transition-colors hover:text-zinc-700"
                            aria-label={
                              showPassword
                                ? "Ocultar contraseña"
                                : "Ver contraseña"
                            }
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex h-11 w-full items-center justify-center rounded-lg text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    style={{ backgroundColor: accent }}
                  >
                    {isSubmitting ? "Entrando…" : "Continuar"}
                  </button>
                </div>
              </form>
            </Form>
          </div>
        </div>

        {useSideImage && (
          <div className="relative hidden min-h-[420px] overflow-hidden bg-zinc-100 md:block">
            <Image
              src={branding.sideImageSrc}
              alt={branding.sideImageAlt}
              fill
              className="object-cover object-top"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-screen items-center justify-center px-4">
          <LoginAtmosphere className="absolute inset-0 z-0" />
          <p className="relative z-10 text-sm text-zinc-400">Cargando…</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
