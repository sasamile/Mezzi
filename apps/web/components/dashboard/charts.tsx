"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export function ConversationsAreaChart({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  const chartData = React.useMemo(
    () =>
      data.map((value, i) => ({
        day: `D${i + 1}`,
        conversations: value,
      })),
    [data]
  );

  const config = {
    conversations: {
      label: "Conversaciones",
      color: "var(--primaryColor)",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto h-[260px] w-full", className)}
    >
      <AreaChart
        data={chartData}
        margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="fillConversations" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--primaryColor)"
              stopOpacity={0.28}
            />
            <stop
              offset="100%"
              stopColor="var(--primaryColor)"
              stopOpacity={0.02}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={36}
          allowDecimals={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <ChartTooltip
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          content={<ChartTooltipContent indicator="line" />}
        />
        <Area
          type="monotone"
          dataKey="conversations"
          stroke="var(--primaryColor)"
          strokeWidth={2}
          fill="url(#fillConversations)"
        />
      </AreaChart>
    </ChartContainer>
  );
}

export function HourlyActivityChart({
  data,
  className,
}: {
  data: number[];
  className?: string;
}) {
  const chartData = React.useMemo(
    () =>
      data.map((value, hour) => ({
        hour: `${String(hour).padStart(2, "0")}`,
        value,
      })),
    [data]
  );

  const config = {
    value: {
      label: "Mensajes",
      color: "var(--primaryColor)",
    },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto h-full min-h-[180px] w-full", className)}
    >
      <BarChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="hour"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={3}
          tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
        />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Bar
          dataKey="value"
          fill="var(--primaryColor)"
          radius={[3, 3, 0, 0]}
          opacity={0.85}
        />
      </BarChart>
    </ChartContainer>
  );
}

export function AiResolutionRing({
  pct,
  size = 120,
}: {
  pct: number;
  size?: number;
}) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const strokeW = 10;
  const clamped = Math.min(100, Math.max(0, pct));

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          className="stroke-muted"
          strokeWidth={strokeW}
        />
        {clamped > 0 && (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--primaryColor)"
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeDasharray={`${(clamped / 100) * circ} ${circ}`}
          />
        )}
      </svg>
      <div className="relative flex flex-col items-center leading-none">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {clamped}%
        </span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Resuelto
        </span>
      </div>
    </div>
  );
}

/** @deprecated use ConversationsAreaChart */
export function DailyChart({ data }: { data: number[]; color: string }) {
  return <ConversationsAreaChart data={data} />;
}

/** @deprecated use HourlyActivityChart */
export function HourlyBars({ data }: { data: number[]; color: string }) {
  return <HourlyActivityChart data={data} />;
}

/** @deprecated use AiResolutionRing */
export function RingChart({
  pct,
  size = 92,
}: {
  pct: number;
  color: string;
  size?: number;
}) {
  return <AiResolutionRing pct={pct} size={size} />;
}
