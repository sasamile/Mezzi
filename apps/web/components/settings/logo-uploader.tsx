"use client";

import type { ChangeEvent, RefObject } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoUploaderProps {
  displayUrl: string;
  uploading: boolean;
  error: string | null;
  pendingStorage: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  accept: string;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onPick: () => void;
  onRemove: () => void;
}

export function LogoUploader({
  displayUrl,
  uploading,
  error,
  pendingStorage,
  fileInputRef,
  accept,
  onFileChange,
  onPick,
  onRemove,
}: LogoUploaderProps) {
  const hasLogo = Boolean(displayUrl) || pendingStorage;

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={onFileChange}
        disabled={uploading}
        className="sr-only"
        aria-label="Subir logo"
      />

      <div className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            "relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40",
            !hasLogo && "border-dashed"
          )}
        >
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Logo del restaurante"
              className="size-full object-contain p-1.5"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : pendingStorage ? (
            <Loader2
              size={18}
              strokeWidth={1.7}
              className="animate-spin text-muted-foreground"
            />
          ) : (
            <ImagePlus
              size={20}
              strokeWidth={1.5}
              className="text-muted-foreground"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPick}
              disabled={uploading}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" strokeWidth={1.7} />
                  Subiendo…
                </>
              ) : hasLogo ? (
                "Cambiar logo"
              ) : (
                "Subir logo"
              )}
            </button>
            {hasLogo && (
              <button
                type="button"
                onClick={onRemove}
                disabled={uploading}
                className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-60"
              >
                <Trash2 size={14} strokeWidth={1.7} />
                Quitar
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, WebP o SVG. Recomendado &lt; 2&nbsp;MB.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
