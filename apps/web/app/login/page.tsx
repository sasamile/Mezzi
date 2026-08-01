"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useMemo, type CSSProperties } from "react";
import { useQuery } from "convex/react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { useMutation } from "convex/react";
import { sileo } from "@/lib/toast";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useAuth } from "@/lib/auth-context";
import { allowsSuperadminPanel } from "@/lib/saas-host-access";
import { getLoginBranding, DEFAULT_LOGIN_SUBTITLE } from "@/lib/site-branding";
import { getVisiblePermissionPages } from "@/lib/permissions-pages";
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
  "h-11 rounded-lg border-border bg-background text-[14px] text-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25";

/** Secciones del panel superadmin (host raíz del SaaS, sin tenant). */
const SUPERADMIN_SECTIONS = ["Restaurantes", "Planes", "Administradores"] as const;

/** Fuente display: se usa solo en los dos titulares. */
const serif: CSSProperties = {
  fontFamily: "var(--font-instrument-serif), Georgia, serif",
};

/** Entrada escalonada. Se anula con reduced-motion. */
const rise =
  "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-out motion-reduce:animate-none";

/**
 * Panel de marca. Se construye solo con lo que todo tenant tiene —color y
 * nombre—, así que funciona para cualquiera sin pedirle ningún asset.
 *
 * Regla de marca: aquí NUNCA va contenido de una vertical concreta. Este login
 * lo comparten la plataforma y cada cliente (un asador, una marca de ropa), así
 * que lo único que se pinta son las secciones reales del panel al que se entra.
 */
function BrandPanel({
  accent,
  brandName,
  eyebrow,
  sections,
}: {
  accent: string;
  brandName: string;
  eyebrow: string;
  sections: readonly string[];
}) {
  return (
    // El borde mantiene visible la división cuando el acento del restaurante es
    // casi negro y el tema oscuro lo funde con el lado del formulario.
    <aside
      className="relative hidden overflow-hidden border-l border-black/10 p-10 md:flex md:flex-col md:justify-end lg:p-14 dark:border-white/10"
      style={{ backgroundColor: accent }}
      aria-hidden
    >
      {/* Luz arriba y peso abajo: el blanco lee sobre cualquier color de marca. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 85% at 12% -10%, rgba(255,255,255,0.26) 0%, transparent 58%), linear-gradient(205deg, transparent 28%, rgba(0,0,0,0.58) 100%)",
        }}
      />
      <div className="absolute -left-28 -top-20 h-80 w-80 rounded-[6rem] border border-white/10" />
      <div className="absolute -bottom-32 -right-24 h-96 w-96 rounded-[7rem] bg-white/[0.05]" />

      <div className="relative">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/60">
          {eyebrow}
        </p>
        <p
          className="mt-3 text-balance text-[clamp(2.5rem,3.8vw,3.75rem)] leading-[1.02] text-white"
          style={serif}
        >
          {brandName}
        </p>
      </div>

      {/* Lo que hay dentro. Sale de la configuración real del panel. */}
      <ul className="relative mt-8 flex max-w-[26rem] flex-wrap gap-2">
        {sections.map((section) => (
          <li
            key={section}
            className="rounded-full border border-white/20 bg-white/[0.08] px-3.5 py-1.5 text-[13px] text-white/85 backdrop-blur-sm"
          >
            {section}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * Estado de espera. Reproduce la forma final en vez de escribir "Cargando…"
 * sobre una pantalla vacía: no hay salto de layout ni nada que leer.
 */
function LoginSkeleton({ accentColor }: { accentColor?: string }) {
  const accent = accentColor ?? "#dc2626";
  return (
    <div className="grid min-h-screen w-full md:grid-cols-2" role="status" aria-label="Cargando">
      <div className="relative flex items-center justify-center px-6 py-12 sm:px-10">
        <LoginAtmosphere accentColor={accent} className="absolute inset-0 z-0" />
        <div className="relative z-10 w-full max-w-[380px] animate-pulse">
          <div className="h-14 w-[230px] rounded-md bg-foreground/[0.07]" />
          <div className="mt-7 h-8 w-[210px] rounded-md bg-foreground/[0.07]" />
          <div className="mt-9 space-y-5">
            <div className="space-y-2">
              <div className="h-3 w-28 rounded bg-foreground/[0.07]" />
              <div className="h-11 rounded-lg bg-foreground/[0.05]" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-20 rounded bg-foreground/[0.07]" />
              <div className="h-11 rounded-lg bg-foreground/[0.05]" />
            </div>
            <div className="h-11 rounded-lg bg-foreground/[0.07]" />
          </div>
        </div>
      </div>
      <div className="hidden md:block" style={{ backgroundColor: accent }} />
    </div>
  );
}

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
  // Se recuerda cuál logo falló, no cuál mostrar: así el logo se deriva en el
  // render y cambiar de tenant no necesita un efecto que resincronice estado.
  const [failedLogoSrc, setFailedLogoSrc] = useState<string | null>(null);
  const fallbackLogoSrc = useMemo(
    () => getLoginBranding(hostname, null).logoSrc,
    [hostname]
  );
  const logoSrc =
    branding.logoSrc === failedLogoSrc ? fallbackLogoSrc : branding.logoSrc;

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
      // Solo el token: los datos del usuario los resuelve el servidor con él.
      login(user.token);
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
        "No pudimos iniciar sesión. Vuelve a intentarlo en un momento.";

      if (
        lower.includes("credenciales inválidas") ||
        lower.includes("invalid credentials")
      ) {
        friendly = "Correo o contraseña incorrectos.";
      } else if (lower.includes("no tienes acceso a este dominio")) {
        friendly =
          "Este usuario no tiene acceso a este restaurante. Entra con una cuenta autorizada.";
      }

      sileo.error({
        title: "No se pudo entrar",
        description: friendly,
      });
    }
  };

  const accent = branding.accentColor ?? "#dc2626";
  const useSideImage = branding.sidePanel === "image";

  // Sin tenant en el host se entra al panel superadmin; con tenant, al panel del
  // restaurante y solo con los módulos que tenga habilitados.
  const panel = useMemo(() => {
    if (!tenantByHost) {
      return { eyebrow: "Panel superadmin", sections: [...SUPERADMIN_SECTIONS] };
    }
    return {
      eyebrow: "Panel de operación",
      sections: getVisiblePermissionPages(
        tenantByHost.enabledModules,
        tenantByHost,
        hostname
      ).map((page) => page.label),
    };
  }, [tenantByHost, hostname]);
  // El subtítulo por defecto no dice nada que el formulario no diga ya.
  const subtitle =
    branding.subtitle.trim() && branding.subtitle !== DEFAULT_LOGIN_SUBTITLE
      ? branding.subtitle
      : null;

  if (isLoading || user) {
    return <LoginSkeleton accentColor={accent} />;
  }

  return (
    <div
      className="grid min-h-screen w-full md:grid-cols-2"
      // El anillo de foco hereda el color del restaurante.
      style={{ "--ring": accent } as CSSProperties}
    >
      <div className="relative flex items-center justify-center px-6 py-12 sm:px-10">
        <LoginAtmosphere accentColor={accent} className="absolute inset-0 z-0" />

        <main className={cn("relative z-10 w-full max-w-[380px]", rise)}>
          <Image
            src={logoSrc}
            alt={branding.logoAlt}
            width={280}
            height={56}
            priority
            unoptimized={logoSrc.startsWith("/")}
            onError={() => {
              if (logoSrc !== fallbackLogoSrc) setFailedLogoSrc(logoSrc);
            }}
            className="h-14 w-auto max-w-[260px] object-contain"
          />

          <h1
            className="mt-7 text-[34px] leading-[1.1] tracking-[-0.01em] text-foreground"
            style={serif}
          >
            Iniciar sesión
          </h1>
          {subtitle && (
            <p className="mt-2 text-[13px] text-muted-foreground">{subtitle}</p>
          )}

          <Form {...form}>
            <form onSubmit={handleSubmit(onSubmit)} className="mt-9 space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-[13px] font-medium text-foreground">
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
                  <FormItem className="space-y-2">
                    <FormLabel className="text-[13px] font-medium text-foreground">
                      Contraseña
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          className={cn(inputClass, "pr-11")}
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
                          aria-label={
                            showPassword ? "Ocultar contraseña" : "Ver contraseña"
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

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-medium text-white transition-[opacity,transform] hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{ backgroundColor: accent }}
              >
                {isSubmitting && (
                  <LoaderCircle
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                )}
                {isSubmitting ? "Entrando" : "Continuar"}
              </button>
            </form>
          </Form>
        </main>
      </div>

      {useSideImage ? (
        <aside
          className="relative hidden overflow-hidden bg-[#0c0c0c] md:block"
          aria-hidden
        >
          <Image
            src={branding.sideImageSrc}
            alt={branding.sideImageAlt}
            fill
            priority
            sizes="50vw"
            className="object-cover object-center"
            unoptimized={branding.sideImageSrc.startsWith("/")}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(0,0,0,0.18) 0%, transparent 18%), linear-gradient(180deg, transparent 70%, rgba(0,0,0,0.35) 100%)",
            }}
          />
        </aside>
      ) : (
        <BrandPanel
          accent={accent}
          brandName={branding.brandName}
          eyebrow={panel.eyebrow}
          sections={panel.sections}
        />
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginContent />
    </Suspense>
  );
}
