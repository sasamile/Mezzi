"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  changePct?: number | null;
  changeLabel?: string;
  icon?: LucideIcon;
  className?: string;
}

/**
 * KPI card estilo dashboard shadcn: label, valor grande, delta, descripción.
 * Sin iconos de color compitiendo — jerarquía tipográfica.
 */
export function StatCard({
  title,
  value,
  description,
  changePct,
  changeLabel = "vs período anterior",
  icon: Icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-xl border border-border bg-card p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {Icon && (
          <Icon
            className="size-4 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
          />
        )}
      </div>
      <div className="mt-3">
        <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        {changePct != null && changePct !== 0 && (
          <p
            className={cn(
              "mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium",
              changePct > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            )}
          >
            {changePct > 0 ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {Math.abs(changePct)}% {changeLabel}
          </p>
        )}
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
