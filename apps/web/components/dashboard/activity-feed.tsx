"use client";

import Link from "next/link";
import { MessageSquare, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActivityItem = {
  name: string;
  status: string;
  time: string;
  escalated: boolean;
};

export function ActivityFeed({
  items,
  emptyHref = "/tenants/inbox",
}: {
  items: ActivityItem[];
  emptyHref?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <MessageSquare
          className="size-5 text-muted-foreground/60"
          strokeWidth={1.5}
        />
        <p className="text-sm text-muted-foreground">Sin actividad reciente</p>
        <Link
          href={emptyHref}
          className="text-xs font-medium text-(--primaryColor) hover:underline"
        >
          Ir al Inbox
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-0.5">
      {items.map((a, i) => (
        <li key={`${a.name}-${i}`}>
          <Link
            href="/tenants/inbox"
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-muted/60"
          >
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                a.escalated
                  ? "bg-(--primarySoft) text-(--primaryColor)"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
              )}
            >
              {a.escalated ? (
                <Users className="size-3.5" strokeWidth={1.8} />
              ) : (
                <MessageSquare className="size-3.5" strokeWidth={1.8} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {a.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {a.status} · {a.time}
                {a.escalated ? " · Humano" : " · Bot"}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
