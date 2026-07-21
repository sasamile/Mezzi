"use client";

import { useState } from "react";
import { FileWarning, ImageOff } from "lucide-react";
import { CustomAudioPlayer } from "@/components/inbox/custom-audio-player";
import { cn } from "@/lib/utils";

function isLikelyExpiredHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes("ycloud.com") ||
      host.includes("whatsapp.net") ||
      host.includes("fbcdn.net")
    );
  } catch {
    return false;
  }
}

interface MessageMediaProps {
  mediaUrl: string;
  mediaType?: "image" | "video" | "audio" | "document" | null;
  content?: string;
  isInbound: boolean;
  avatarSeed: string;
  createdAt: number;
  onOpenImage?: () => void;
}

export function MessageMedia({
  mediaUrl,
  mediaType,
  content,
  isInbound,
  avatarSeed,
  createdAt,
  onOpenImage,
}: MessageMediaProps) {
  const [failed, setFailed] = useState(false);
  const ephemeral = isLikelyExpiredHost(mediaUrl);
  const unavailable = failed || (ephemeral && mediaType === "document");

  if (mediaType === "video") {
    if (failed || ephemeral) {
      return <MediaUnavailable label="Video no disponible" />;
    }
    return (
      <video
        src={mediaUrl}
        controls
        className="max-h-64 w-full rounded object-contain"
        onError={() => setFailed(true)}
      />
    );
  }

  if (mediaType === "document") {
    if (unavailable) {
      return (
        <MediaUnavailable
          label="Documento no disponible"
          detail="El archivo temporal de WhatsApp ya caducó"
        />
      );
    }
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="relative max-h-[min(70vh,520px)] min-h-56 overflow-y-auto overscroll-contain bg-muted">
          <iframe
            src={`${mediaUrl}#toolbar=0&navpanes=0&view=FitH`}
            className="block h-[720px] w-full border-0 bg-card"
            title="Vista previa PDF"
            onError={() => setFailed(true)}
          />
        </div>
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 border-t border-border p-3 transition-colors hover:bg-muted/50"
        >
          <div
            className="grid size-11 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
            style={{ backgroundColor: "var(--primaryColor)" }}
          >
            PDF
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {content && content !== "Documento" ? content : "Documento"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Desplázate o toca para abrir completo
            </p>
          </div>
        </a>
      </div>
    );
  }

  if (mediaType === "audio") {
    if (failed) {
      return <MediaUnavailable label="Audio no disponible" />;
    }
    return (
      <div className="-ml-1">
        <CustomAudioPlayer
          src={mediaUrl}
          isContact={isInbound}
          avatarSeed={avatarSeed}
          timestamp={new Date(createdAt).toLocaleTimeString("es", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        />
      </div>
    );
  }

  // image / sticker / default
  if (failed) {
    return <MediaUnavailable label="Imagen no disponible" icon="image" />;
  }

  return (
    <div
      className={cn(
        "max-w-sm overflow-hidden rounded-md",
        onOpenImage && "cursor-pointer"
      )}
      onClick={onOpenImage}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl}
        alt="Imagen adjunta"
        className="max-h-64 w-full object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function MediaUnavailable({
  label,
  detail,
  icon = "file",
}: {
  label: string;
  detail?: string;
  icon?: "file" | "image";
}) {
  const Icon = icon === "image" ? ImageOff : FileWarning;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={1.7} />
      <div className="min-w-0">
        <p className="font-medium text-foreground/80">{label}</p>
        {detail && <p className="mt-0.5 text-[11px]">{detail}</p>}
      </div>
    </div>
  );
}
