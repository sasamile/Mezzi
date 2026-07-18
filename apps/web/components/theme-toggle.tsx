"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SidebarTooltip } from "@/components/sidebar-tooltip";

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = mounted && theme === "dark";
  const label = isDark ? "Modo claro" : "Modo oscuro";

  const button = (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "flex items-center gap-2 rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
        collapsed
          ? "size-10 justify-center"
          : "mx-1.5 h-9 w-[calc(100%-0.75rem)] px-3 text-[13px]"
      )}
      aria-label={label}
    >
      {!mounted ? (
        <Sun size={16} strokeWidth={1.7} className="shrink-0 opacity-0" />
      ) : isDark ? (
        <Sun size={16} strokeWidth={1.7} className="shrink-0" />
      ) : (
        <Moon size={16} strokeWidth={1.7} className="shrink-0" />
      )}
      {!collapsed && <span className="font-medium">{label}</span>}
    </button>
  );

  if (collapsed) {
    return <SidebarTooltip label={label}>{button}</SidebarTooltip>;
  }

  return button;
}
