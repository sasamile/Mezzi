"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PERMISSION_PAGES } from "@/lib/permissions-pages";

interface ManagePermissionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  allowedPages: string[];
  onSave: (allowedPages: string[]) => Promise<void>;
  primaryColor: string;
}

const GROUPS = ["General", "Conocimiento", "Integraciones", "Usuarios"];

export function ManagePermissionsModal({
  open,
  onOpenChange,
  title,
  description,
  allowedPages: initialAllowed,
  onSave,
  primaryColor,
}: ManagePermissionsModalProps) {
  const [allowedPages, setAllowedPages] = React.useState<string[]>(initialAllowed);
  const [saving, setSaving] = React.useState(false);
  const allKeys = PERMISSION_PAGES.map((p) => p.key);

  React.useEffect(() => {
    if (open) setAllowedPages(initialAllowed);
  }, [open, initialAllowed]);

  const toggle = (key: string) => {
    setAllowedPages((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAll = () => setAllowedPages([...allKeys]);
  const selectNone = () => setAllowedPages([]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(allowedPages);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="text-xs px-2 py-1.5"
              onClick={selectAll}
            >
              Todas
            </Button>
            <Button
              type="button"
              variant="outline"
              className="text-xs px-2 py-1.5"
              onClick={selectNone}
            >
              Ninguna
            </Button>
          </div>

          <div className="space-y-4 max-h-[280px] overflow-y-auto pr-1">
            {GROUPS.map((group) => {
              const items = PERMISSION_PAGES.filter((p) => p.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {group}
                  </p>
                  <div className="space-y-2">
                    {items.map((page) => (
                      <label
                        key={page.key}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                          allowedPages.includes(page.key)
                            ? "border-border bg-muted/40"
                            : "border-border hover:bg-muted/40"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={allowedPages.includes(page.key)}
                          onChange={() => toggle(page.key)}
                          className="size-4 rounded border-border"
                          style={{ accentColor: primaryColor }}
                        />
                        <span className="text-sm font-medium text-foreground">
                          {page.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: primaryColor }}
          >
            {saving ? "Guardando…" : "Guardar permisos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
