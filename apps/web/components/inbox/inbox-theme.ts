/**
 * Clases semánticas del inbox — light/dark + primaryColor del tenant.
 * Status colors (bot/humano) son semánticos, no brand.
 */
export const inbox = {
  shell: "bg-inbox-bg text-foreground antialiased",
  chat: "bg-inbox-chat text-foreground",
  panel: "bg-inbox-panel",
  panelMuted: "bg-inbox-panel-muted",
  border: "border-inbox-border",
  input: "bg-inbox-input",
  bubbleIn:
    "rounded-2xl rounded-tl-md bg-inbox-bubble-in text-inbox-bubble-in-fg border border-inbox-border shadow-[0_1px_0.5px_rgba(0,0,0,0.04)] dark:shadow-none",
  bubbleOut:
    "rounded-2xl rounded-tr-md bg-inbox-bubble-out text-inbox-bubble-out-fg shadow-[0_1px_0.5px_rgba(0,0,0,0.06)] dark:shadow-none",
  header: "bg-inbox-panel border-b border-inbox-border",
  composer: "bg-inbox-panel border-t border-inbox-border",
  composerInput:
    "rounded-2xl border border-inbox-border bg-inbox-input focus-within:border-[var(--primaryColor)]/50",
  listRow:
    "mx-2 mb-0.5 box-border h-16 shrink-0 rounded-xl transition-colors duration-150",
  listRowHover: "hover:bg-muted/60",
  listRowSelected: "bg-[var(--primarySoft)]",
  listRail:
    "absolute left-1.5 top-1/2 h-7 w-1 -translate-y-1/2 rounded-full transition-colors",
  chipIdle:
    "border border-inbox-border bg-inbox-panel-muted text-muted-foreground shadow-none hover:bg-muted hover:text-foreground",
  chipActive:
    "border-transparent font-semibold text-white shadow-none",
  search:
    "border border-inbox-border bg-inbox-panel-muted focus-within:border-border focus-within:bg-inbox-panel",
  iconBtn:
    "bg-inbox-panel-muted text-muted-foreground shadow-none hover:bg-muted hover:text-foreground",
  hoverSubtle: "hover:bg-foreground/5",
  /** Status: bot = emerald, human = brand, urgent = amber */
  badgeBot: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
  badgeHuman:
    "bg-[var(--primarySoft)] text-[var(--primaryColor)]",
  badgeUrgent: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400",
  badgePending: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
} as const;

/** Colores de prioridad (hex seguro para inline style). */
export const PRIORITY_DOT_SAFE: Record<
  "low" | "normal" | "high" | "urgent",
  string
> = {
  low: "#10b981",
  normal: "#f59e0b",
  high: "#f97316",
  urgent: "#dc2626",
};

export const FILTER_CHIP_ACTIVE: Record<
  "all" | "bot" | "human" | "urgent",
  string
> = {
  all: "bg-[var(--primaryColor)] text-white",
  bot: "bg-emerald-600 text-white dark:bg-emerald-500",
  human: "bg-[var(--primaryColor)] text-white",
  urgent: "bg-amber-500 text-white dark:bg-amber-500",
};
