"use client";

import type { MouseEvent } from "react";
import type { Id } from "@/convex";
import { AlertTriangle, Bot, CornerUpLeft, Flag, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContactAvatar } from "./contact-avatar";
import { inbox, PRIORITY_DOT_SAFE } from "./inbox-theme";

const PRIORITY_LABELS = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
} as const;

type Priority = keyof typeof PRIORITY_LABELS;

function hasPriority(
  p: string | undefined | null
): p is Priority {
  return p === "low" || p === "normal" || p === "high" || p === "urgent";
}

export type ConversationListItemData = {
  _id: Id<"conversations">;
  customerName: string;
  lastMessageAt: number;
  lastMessagePreview?: string;
  lastMessageDirection?: string;
  status: string;
  priority?: string | null;
  assignedTo?: Id<"users"> | null;
};

interface ConversationListItemProps {
  conv: ConversationListItemData;
  isActive: boolean;
  isNew: boolean;
  isBot: boolean;
  onSelect: () => void;
  onContextMenu: (e: MouseEvent) => void;
}

/** Fila de altura fija: selección y badges no cambian el tamaño. */
export function ConversationListItem({
  conv,
  isActive,
  isNew,
  isBot,
  onSelect,
  onContextMenu,
}: ConversationListItemProps) {
  const priority = hasPriority(conv.priority) ? conv.priority : null;
  const showPriority = Boolean(priority) && conv.status !== "pending";

  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={cn(
        "relative mx-2 mb-0.5 box-border flex h-16 w-[calc(100%-1rem)] shrink-0 items-center gap-2.5 overflow-hidden rounded-xl px-3 pl-3.5 text-left transition-colors duration-150",
        isActive
          ? "bg-[var(--primarySoft)]"
          : "bg-transparent hover:bg-muted/60"
      )}
    >
      <span
        aria-hidden
        className="absolute left-1.5 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full"
        style={{
          background: isActive || isNew ? "var(--primaryColor)" : "transparent",
        }}
      />

      <ContactAvatar name={conv.customerName} size="md" className="shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex h-5 items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-[13px] font-medium leading-5 text-foreground",
              isNew && "font-semibold"
            )}
          >
            {conv.customerName}
          </span>
          <span
            className={cn(
              "shrink-0 text-[10px] leading-5 tabular-nums text-muted-foreground",
              isNew && "font-semibold text-[var(--primaryColor)]"
            )}
          >
            {new Date(conv.lastMessageAt).toLocaleTimeString("es", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div className="mt-0.5 flex h-5 items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {conv.lastMessageDirection === "OUTBOUND" && (
              <CornerUpLeft
                className="shrink-0 text-muted-foreground"
                size={11}
                strokeWidth={2}
              />
            )}
            <span className="truncate text-[11px] leading-5 text-muted-foreground">
              {conv.lastMessageDirection === "OUTBOUND" && (
                <span className="font-medium text-foreground">Tú: </span>
              )}
              {conv.lastMessagePreview || "—"}
            </span>
          </div>

          {/* Columna fija: slot prioridad + bot → el robot no se mueve */}
          <div className="flex h-5 w-11 shrink-0 items-center justify-end gap-1">
            <span className="inline-flex size-5 items-center justify-center">
              {conv.status === "pending" ? (
                <span
                  className="inline-flex size-5 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20"
                  title="Necesita atención"
                >
                  <span className="size-1.5 rounded-full bg-amber-500" />
                </span>
              ) : showPriority && priority ? (
                <span
                  className="inline-flex size-5 items-center justify-center rounded-full"
                  style={{
                    background: `${PRIORITY_DOT_SAFE[priority]}22`,
                    color: PRIORITY_DOT_SAFE[priority],
                  }}
                  title={`Prioridad: ${PRIORITY_LABELS[priority]}`}
                >
                  {priority === "urgent" || priority === "high" ? (
                    <AlertTriangle size={11} strokeWidth={2.4} />
                  ) : (
                    <Flag size={11} strokeWidth={2.4} />
                  )}
                </span>
              ) : null}
            </span>
            <span
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full",
                isBot ? inbox.badgeBot : inbox.badgeHuman
              )}
              title={isBot ? "Bot IA" : "Agente humano"}
            >
              {isBot ? (
                <Bot size={11} strokeWidth={2.2} />
              ) : (
                <UserRound size={11} strokeWidth={2.2} />
              )}
            </span>
          </div>
        </div>
      </div>

      {isNew && (
        <span
          className="absolute right-2 top-2 size-1.5 rounded-full bg-[var(--primaryColor)]"
          title="Nuevo"
        />
      )}
    </button>
  );
}
