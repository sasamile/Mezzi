"use client";

import { Bot, Search, UserRound, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILTER_CHIP_ACTIVE, inbox } from "./inbox-theme";
import { Skeleton } from "@/components/ui/skeleton";

export type FilterMode = "all" | "bot" | "human" | "urgent";

const FILTERS: {
  id: FilterMode;
  label: string;
  Icon: typeof Bot | null;
}[] = [
  { id: "all", label: "Todas", Icon: null },
  { id: "bot", label: "Bot", Icon: Bot },
  { id: "human", label: "Humano", Icon: UserRound },
  { id: "urgent", label: "Urgentes", Icon: AlertTriangle },
];

interface ConversationsListHeaderProps {
  filterMode: FilterMode;
  onFilterChange: (mode: FilterMode) => void;
  counts: Record<FilterMode, number>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function ConversationsListHeader({
  filterMode,
  onFilterChange,
  counts,
  searchQuery,
  onSearchChange,
}: ConversationsListHeaderProps) {
  return (
    <header className={cn("shrink-0 space-y-3 p-3", inbox.header)}>
      <div className="flex items-center justify-between px-0.5">
        <h1 className="text-base font-semibold tracking-tight text-foreground">
          Chats
        </h1>
      </div>

      <div className={cn("relative flex h-9 items-center rounded-lg", inbox.search)}>
        <Search
          className="absolute left-2.5 text-muted-foreground"
          size={15}
          strokeWidth={1.8}
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar cliente o número…"
          className="h-full w-full rounded-lg bg-transparent pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filterMode === f.id;
          const Icon = f.Icon;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] transition-colors duration-150",
                active ? FILTER_CHIP_ACTIVE[f.id] : inbox.chipIdle
              )}
            >
              {Icon && <Icon size={12} strokeWidth={2} />}
              {f.label}
              <span
                className={cn(
                  "tabular-nums",
                  active ? "opacity-80" : "text-muted-foreground"
                )}
              >
                {counts[f.id]}
              </span>
            </button>
          );
        })}
      </div>
    </header>
  );
}

export function ConversationsListSkeleton() {
  return (
    <div className="space-y-0.5 px-2 py-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex h-16 items-center gap-3 rounded-xl px-3 pl-4",
            inbox.listRow
          )}
        >
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationsListEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-sm font-medium text-foreground">No hay conversaciones</p>
      <p className="text-xs text-muted-foreground">
        Los mensajes de WhatsApp aparecerán aquí.
      </p>
    </div>
  );
}
