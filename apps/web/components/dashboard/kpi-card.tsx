"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string | number;
  changePct?: number | null;
  changeLabel?: string;
  sparkline?: number[];
  icon: LucideIcon;
  primaryColor: string;
  subtitle?: React.ReactNode;
  className?: string;
}

function MiniSpark({ data, color }: { data: number[]; color: string }) {
  const gradId = React.useId().replace(/:/g, "");
  if (!data?.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const n = Math.max(data.length - 1, 1);
  const W = 100;
  const H = 28;

  const pts = data.map((v, i) => ({
    x: (i / n) * W,
    y: H - ((v - min) / range) * (H - 4) - 2,
  }));

  const polyLine = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPts = `0,${H} ${polyLine} ${W},${H}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-3 w-full"
      style={{ height: 22 }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`ms-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#ms-${gradId})`} />
      <polyline
        points={polyLine}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function KPICard({
  title,
  value,
  changePct,
  changeLabel = "vs período anterior",
  sparkline,
  icon: Icon,
  primaryColor,
  subtitle,
  className,
}: KPICardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5 transition-colors duration-150",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div
          className="flex size-8 items-center justify-center rounded-lg"
          style={{
            backgroundColor: `color-mix(in srgb, ${primaryColor} 12%, white)`,
            color: primaryColor,
          }}
        >
          <Icon className="size-4" strokeWidth={1.8} />
        </div>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {changePct != null && changePct !== 0 && (
        <span
          className={cn(
            "mt-2 inline-flex items-center gap-0.5 text-xs font-medium",
            changePct > 0 ? "text-emerald-600" : "text-rose-500"
          )}
        >
          {changePct > 0 ? (
            <ArrowUpRight className="size-3.5" />
          ) : (
            <ArrowDownRight className="size-3.5" />
          )}
          {Math.abs(changePct)}% {changeLabel}
        </span>
      )}
      {subtitle}
      {sparkline && sparkline.length > 0 && (
        <MiniSpark data={sparkline} color={primaryColor} />
      )}
    </div>
  );
}

export { MiniSpark };
