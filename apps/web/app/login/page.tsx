"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useMemo } from "react";
import { useQuery } from "convex/react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { useMutation } from "convex/react";
import { sileo } from "sileo";
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
import { Button } from "@/components/ui/button";
import Image from "next/image";
import {
  DashedGridBackground,
  dashedGridFadeForHour,
  type DashedGridFade,
} from "@/components/login/dashed-grid-background";

const loginSchema = z.object({
  email: z.string().email({ message: "Ingresa un correo válido" }),
  password: z
    .string()
    .min(5, { message: "La contraseña debe tener al menos 5 caracteres" }),
});

type LoginValues = z.infer<typeof loginSchema>;

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

  const [gridFade, setGridFade] = useState<DashedGridFade>("top");
  useEffect(() => {
    setGridFade(dashedGridFadeForHour(new Date().getHours()));
  }, []);

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

  if (isLoading || user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-4">
        <DashedGridBackground fade="top" className="absolute inset-0 z-0" />
        <p className="relative z-10 text-slate-600">Cargando...</p>
      </div>
    );
  }

  const useGridBackground = branding.sidePanel === "dashed-grid";

  return (
    <div
      className={
        useGridBackground
          ? "relative flex min-h-screen w-full items-center justify-center px-4 py-10"
          : "flex min-h-screen items-center justify-center bg-linear-to-b from-zinc-50 via-zinc-50 to-red-50 px-4 py-10"
      }
    >
      {useGridBackground && (
        <DashedGridBackground fade={gridFade} className="absolute inset-0 z-0" />
      )}
      <div
        className={
          useGridBackground
            ? "relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.12)]"
            : "grid min-h-[80vh] w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-zinc-200 bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.18)] md:grid-cols-2"
        }
      >
        <div className="flex items-center px-6 py-8 sm:px-10">
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-4">
              <div className="flex justify-center px-2">
                <Image
                  src={logoSrc}
                  alt={branding.logoAlt}
                  width={260}
                  height={43}
                  priority
                  unoptimized={logoSrc.startsWith("/")}
                  onError={() => {
                    const fallback = getLoginBranding(hostname, null).logoSrc;
                    if (fallback && fallback !== logoSrc) setLogoSrc(fallback);
                  }}
                  className={
                    useGridBackground
                      ? "h-auto w-full max-w-[220px] object-contain"
                      : "h-auto w-full max-w-[240px] object-contain"
                  }
                />
              </div>
              <p className="text-center text-sm text-zinc-500">
                {branding.subtitle}
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo electrónico</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="tu@restaurante.com"
                          autoComplete="email"
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
                      <FormLabel>Contraseña</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            className="pr-10"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute inset-y-0 right-3 flex items-center justify-center text-zinc-400 hover:text-zinc-600"
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
                  <Button
                    type="submit"
                    variant={branding.accentColor ? "ghost" : "default"}
                    disabled={isSubmitting}
                    className={
                      branding.accentColor
                        ? "h-11 w-full rounded-2xl px-4 text-white hover:opacity-90"
                        : "h-11 w-full rounded-2xl px-4"
                    }
                    style={
                      branding.accentColor
                        ? { backgroundColor: branding.accentColor }
                        : undefined
                    }
                  >
                    {isSubmitting ? "Entrando..." : "Iniciar sesión"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>

        {!useGridBackground && (
          <div className="relative hidden h-full w-full overflow-hidden bg-[#fff5f5] md:block">
            <Image
              src={branding.sideImageSrc}
              alt={branding.sideImageAlt}
              fill
              className="rounded-3xl object-cover object-top"
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
          <DashedGridBackground fade="top" className="absolute inset-0 z-0" />
          <p className="relative z-10 text-slate-600">Cargando...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
