"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Thin wrapper for the message scroll region (Fincasya density). */
export function ConversationThread({ children }: { children: ReactNode }) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5")}>
      {children}
    </div>
  );
}
