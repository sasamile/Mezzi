"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast:
            "group border border-border bg-card text-foreground shadow-md",
          title: "text-sm font-semibold text-foreground",
          description: "text-sm text-muted-foreground",
          closeButton:
            "border border-border bg-background text-muted-foreground",
          success: "border-emerald-500/20",
          error: "border-destructive/30",
        },
      }}
    />
  );
}
