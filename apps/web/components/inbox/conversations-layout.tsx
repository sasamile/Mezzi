"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { inbox } from "./inbox-theme";

interface ConversationsLayoutProps {
  list: ReactNode;
  chat: ReactNode;
  /** En móvil: si hay conversación seleccionada, mostrar chat. */
  showChatOnMobile?: boolean;
}

/**
 * Split Fincasya-style: lista fija clamp + chat rounded.
 * Light theme; primaryColor vía CSS vars del shell.
 */
export function ConversationsLayout({
  list,
  chat,
  showChatOnMobile = false,
}: ConversationsLayoutProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-hidden",
        inbox.shell
      )}
    >
      <aside
        className={cn(
          "flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden border-r md:w-[clamp(300px,36vw,440px)] md:min-w-[300px] md:max-w-[50%]",
          inbox.border,
          inbox.panel,
          showChatOnMobile ? "hidden md:flex" : "flex"
        )}
      >
        {list}
      </aside>
      <section
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-none md:rounded-none",
          inbox.chat,
          showChatOnMobile ? "flex" : "hidden md:flex"
        )}
      >
        {chat}
      </section>
    </div>
  );
}
