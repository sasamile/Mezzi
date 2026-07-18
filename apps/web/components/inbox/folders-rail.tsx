"use client";

import { Check, ChevronDown, Inbox, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { folderIcon, UNCLASSIFIED } from "@/lib/inbox-folders";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface FolderChip {
  _id: string;
  name: string;
  color?: string;
  icon?: string;
}

/** Valor de selección: null = todas, UNCLASSIFIED = sin clasificar, o id de carpeta. */
export type FolderSelection = string | null;

interface FoldersRailProps {
  folders: FolderChip[];
  counts: Record<string, number>;
  totalCount: number;
  unclassifiedCount: number;
  showUnclassified: boolean;
  selected: FolderSelection;
  onSelect: (value: FolderSelection) => void;
  canManage: boolean;
  onManage: () => void;
}

export function FoldersRail({
  folders,
  counts,
  totalCount,
  unclassifiedCount,
  showUnclassified,
  selected,
  onSelect,
  canManage,
  onManage,
}: FoldersRailProps) {
  const selectedFolder =
    selected && selected !== UNCLASSIFIED
      ? folders.find((f) => f._id === selected)
      : null;

  const label =
    selected === null
      ? "Todas"
      : selected === UNCLASSIFIED
        ? "Sin clasificar"
        : (selectedFolder?.name ?? "Carpeta");

  const count =
    selected === null
      ? totalCount
      : selected === UNCLASSIFIED
        ? unclassifiedCount
        : (counts[selected] ?? 0);

  const TriggerIcon =
    selected === null
      ? Inbox
      : selected === UNCLASSIFIED
        ? Inbox
        : folderIcon(selectedFolder?.icon);

  const triggerColor =
    selectedFolder?.color ??
    (selected === null ? "var(--primaryColor)" : undefined);

  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 text-left text-sm transition-colors hover:bg-muted"
            )}
          >
            <TriggerIcon
              size={15}
              strokeWidth={2}
              className="shrink-0"
              style={triggerColor ? { color: triggerColor } : undefined}
            />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {label}
            </span>
            <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
              {count}
            </span>
            <ChevronDown
              size={14}
              strokeWidth={2}
              className="shrink-0 text-muted-foreground"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[min(100vw-2rem,280px)] shadow-md">
          <DropdownMenuLabel>Filtrar por carpeta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onSelect(null)}
            className="flex items-center gap-2"
          >
            <Inbox size={14} strokeWidth={2} className="text-[var(--primaryColor)]" />
            <span className="flex-1">Todas</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {totalCount}
            </span>
            {selected === null && (
              <Check size={14} className="text-[var(--primaryColor)]" />
            )}
          </DropdownMenuItem>
          {folders.map((f) => {
            const Icon = folderIcon(f.icon);
            const active = selected === f._id;
            return (
              <DropdownMenuItem
                key={f._id}
                onClick={() => onSelect(f._id)}
                className="flex items-center gap-2"
              >
                <Icon size={14} strokeWidth={2} style={{ color: f.color }} />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {counts[f._id] ?? 0}
                </span>
                {active && (
                  <Check size={14} style={{ color: f.color ?? "var(--primaryColor)" }} />
                )}
              </DropdownMenuItem>
            );
          })}
          {showUnclassified && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onSelect(UNCLASSIFIED)}
                className="flex items-center gap-2"
              >
                <span className="flex-1">Sin clasificar</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {unclassifiedCount}
                </span>
                {selected === UNCLASSIFIED && (
                  <Check size={14} className="text-muted-foreground" />
                )}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canManage && (
        <button
          type="button"
          onClick={onManage}
          title="Gestionar carpetas"
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Settings2 size={15} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}
