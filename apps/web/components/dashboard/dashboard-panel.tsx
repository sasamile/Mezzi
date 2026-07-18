"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DashboardPanelProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function DashboardPanel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: DashboardPanelProps) {
  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0 pt-0.5">{action}</div>}
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col p-5", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
