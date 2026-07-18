"use client";

import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Flag,
  Info,
  RotateCw,
  UserRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { inbox } from "./inbox-theme";
import { ContactAvatar } from "./contact-avatar";

const PRIORITY_LABELS = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
} as const;

const PRIORITY_DOT: Record<"low" | "normal" | "high" | "urgent", string> = {
  low: "#10b981",
  normal: "#f59e0b",
  high: "#f97316",
  urgent: "#dc2626",
};

type Priority = "low" | "normal" | "high" | "urgent";

interface ConversationHeaderProps {
  customerName: string;
  status: string;
  isBot: boolean;
  isPending: boolean;
  phone: string | null;
  priority?: Priority | null;
  retryingBot: boolean;
  showRetryBot: boolean;
  showContactInfo: boolean;
  onBack: () => void;
  onToggleMode: () => void;
  canTakeControl: boolean;
  onRetryBot: () => void;
  onResolve: () => void;
  onReopen: () => void;
  onSetPriority: (p: Priority | null) => void;
  onToggleContactInfo: () => void;
}

export function ConversationHeader({
  customerName,
  status,
  isBot,
  isPending,
  phone,
  priority,
  retryingBot,
  showRetryBot,
  showContactInfo,
  onBack,
  onToggleMode,
  canTakeControl,
  onRetryBot,
  onResolve,
  onReopen,
  onSetPriority,
  onToggleContactInfo,
}: ConversationHeaderProps) {
  const hasPriority =
    priority === "low" ||
    priority === "normal" ||
    priority === "high" ||
    priority === "urgent";

  return (
    <header
      className={cn(
        "flex shrink-0 items-center gap-2.5 px-3 py-2.5",
        inbox.header
      )}
    >
      <button
        type="button"
        onClick={onBack}
        className={cn(
          "grid size-8 place-items-center rounded-lg md:hidden",
          inbox.iconBtn
        )}
      >
        <ArrowLeft size={16} />
      </button>

      <ContactAvatar name={customerName} size="md" />

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[15px] font-medium text-foreground">
          {customerName}
        </h2>
        <div className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              isPending
                ? inbox.badgePending
                : isBot
                  ? inbox.badgeBot
                  : inbox.badgeHuman
            )}
          >
            {isPending ? "Necesita atención" : isBot ? "Bot IA" : "Agente"}
          </span>
          <span>·</span>
          <span>
            {status === "open"
              ? "Activo"
              : status === "closed"
                ? "Cerrado"
                : "Pendiente"}
          </span>
          {phone && (
            <>
              <span>·</span>
              <span className="truncate">{phone}</span>
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleMode}
        disabled={isBot && !canTakeControl}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors duration-150 disabled:opacity-50",
          isPending
            ? inbox.badgePending + " hover:opacity-90"
            : isBot
              ? inbox.badgeBot + " hover:opacity-90"
              : inbox.badgeHuman + " hover:opacity-90"
        )}
      >
        {isBot ? (
          <Bot size={13} strokeWidth={2} />
        ) : (
          <UserRound size={13} strokeWidth={2} />
        )}
        {isPending ? "Atender" : isBot ? "Bot activo" : "Agente"}
      </button>

      {showRetryBot && (
        <button
          type="button"
          onClick={onRetryBot}
          disabled={retryingBot}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-colors disabled:opacity-50",
            inbox.chipIdle
          )}
        >
          <RotateCw
            size={13}
            strokeWidth={2}
            className={cn(retryingBot && "animate-spin")}
          />
          {retryingBot ? "Reprocesando…" : "Reintentar"}
        </button>
      )}

      {status !== "closed" ? (
        <button
          type="button"
          onClick={onResolve}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:hover:bg-emerald-500/30"
        >
          <CheckCircle2 size={13} strokeWidth={2} />
          Resolver
        </button>
      ) : (
        <button
          type="button"
          onClick={onReopen}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium",
            inbox.chipIdle
          )}
        >
          Reabrir
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Prioridad"
            className={cn("grid size-8 place-items-center rounded-lg", inbox.iconBtn)}
            style={
              hasPriority ? { color: PRIORITY_DOT[priority!] } : undefined
            }
          >
            <Flag size={16} strokeWidth={1.7} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="shadow-md">
          <DropdownMenuLabel>Prioridad</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {hasPriority && (
            <>
              <DropdownMenuItem onClick={() => onSetPriority(null)}>
                Quitar prioridad
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {(["low", "normal", "high", "urgent"] as const).map((p) => (
            <DropdownMenuItem key={p} onClick={() => onSetPriority(p)}>
              <span
                className="mr-2 size-2 rounded-full"
                style={{ background: PRIORITY_DOT[p] }}
              />
              {PRIORITY_LABELS[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        onClick={onToggleContactInfo}
        className={cn(
          "grid size-8 place-items-center rounded-lg transition-colors",
          showContactInfo
            ? "bg-(--primarySoft) text-(--primaryColor)"
            : inbox.iconBtn
        )}
        title="Info de contacto"
      >
        <Info size={16} strokeWidth={1.7} />
      </button>
    </header>
  );
}

export { PRIORITY_DOT, PRIORITY_LABELS };
