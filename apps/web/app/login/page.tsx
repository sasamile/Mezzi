"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { useMutation } from "convex/react";
import { sileo } from "sileo";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/convex";
import { useAuth } from "@/lib/auth-context";
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

const loginSchema = z.object({
  email: z.string().email({ message: "Ingresa un correo válido" }),
  password: z
    .string()
    .min(6, { message: "La contraseña debe tener al menos 6 caracteres" }),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, login } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) return;
    const returnUrl = searchParams.get("redirect") ?? searchParams.get("returnUrl");
    if (returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
      router.replace(returnUrl);
    } else if (user.isSuperadmin) {
      router.replace("/superadmin");
    } else {
      router.replace("/tenants");
    }
  }, [user, isLoading, searchParams, router]);
  const authLogin = useMutation(api.auth.login);
  const [showPassword, setShowPassword] = useState(false);

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
      const user = await authLogin(values);
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
      if (user.isSuperadmin) {
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
      }

      sileo.error({
        title: "Error al iniciar sesión",
        description: friendly,
      });
    }
  };

  if (isLoading || user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-zinc-50 via-zinc-50 to-red-50">
        <p className="text-slate-600">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-zinc-50 via-zinc-50 to-red-50 px-4 py-10">
      <div className="grid min-h-[80vh] p-4 w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] md:grid-cols-2">
        <div className="flex items-center px-6 py-8 sm:px-10">
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-4">
              <div className="flex justify-center">
                <Image
                  src="/logos/logoalcarbo.svg"
                  alt="Logo Mezzi"
                  width={180}
                  height={80}
                />
              </div>
              <p className="text-sm text-zinc-500 text-center">
                Ingresa tus credenciales para acceder al panel de restaurantes.
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
                    disabled={isSubmitting}
                    className="h-11 w-full rounded-2xl px-4"
                  >
                    {isSubmitting ? "Entrando..." : "Iniciar sesión"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>

        <div className="relative h-full  hidden  w-full overflow-hidden bg-[#fff5f5] md:block">
          <Image
            src="https://media-cdn.tripadvisor.com/media/photo-m/1280/14/40/1e/7e/vista-del-restaurante.jpg"
            alt="Panel de ejemplo"
            fill
            className="object-cover object-top rounded-3xl"
          />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-zinc-50 via-zinc-50 to-red-50">
          <p className="text-slate-600">Cargando...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
