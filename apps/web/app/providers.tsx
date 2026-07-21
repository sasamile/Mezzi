"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const isConfigured = url && url.length > 0 && !url.includes("placeholder");

export function Providers({ children }: { children: React.ReactNode }) {
  if (!isConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <h2 className="font-semibold text-destructive">Convex no configurado</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Añade <code className="rounded bg-muted px-1">NEXT_PUBLIC_CONVEX_URL</code> en{" "}
            <code className="rounded bg-muted px-1">apps/web/.env.local</code>. Ejecuta{" "}
            <code className="rounded bg-muted px-1">npx convex dev</code> en{" "}
            <code className="rounded bg-muted px-1">apps/backend</code> para obtener la URL del deployment.
          </p>
        </div>
      </div>
    );
  }

  const convex = new ConvexReactClient(url);
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={0}>
        <ConvexProvider client={convex}>
          {children}
          <Toaster />
        </ConvexProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
