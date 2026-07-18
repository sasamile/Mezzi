"use client";

import type { ChangeEvent, RefObject } from "react";
import { ImageIcon, Mic, Paperclip, Send, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { inbox } from "./inbox-theme";

interface PendingAttachment {
  type: "image" | "audio" | "document";
  file: File;
  preview?: string;
}

interface ConversationComposerProps {
  replyText: string;
  onReplyChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  sendError: string | null;
  pendingAttachments: PendingAttachment[];
  onRemoveAttachment: (index: number) => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  onImprove: () => void;
  improving: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  imageInputRef: RefObject<HTMLInputElement | null>;
  documentInputRef: RefObject<HTMLInputElement | null>;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onImageChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onDocumentChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

export function ConversationComposer({
  replyText,
  onReplyChange,
  onSend,
  sending,
  sendError,
  pendingAttachments,
  onRemoveAttachment,
  isRecording,
  onToggleRecording,
  onImprove,
  improving,
  fileInputRef,
  imageInputRef,
  documentInputRef,
  onFileSelect,
  onImageChange,
  onDocumentChange,
}: ConversationComposerProps) {
  return (
    <div className={cn("shrink-0 p-3", inbox.composer)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={onFileSelect}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onImageChange}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        multiple
        className="hidden"
        onChange={onDocumentChange}
      />

      {pendingAttachments.length > 0 && (
        <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
          {pendingAttachments.map((att, i) => (
            <div key={i} className="relative shrink-0">
              {att.type === "image" && att.preview ? (
                <img
                  src={att.preview}
                  alt=""
                  className="h-14 w-14 rounded-lg border border-border object-cover"
                />
              ) : (
                <div className="grid h-14 w-14 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
                  {att.type === "document" ? (
                    <Paperclip size={18} />
                  ) : (
                    <Mic size={18} />
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemoveAttachment(i)}
                className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-foreground text-xs text-background"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1 transition-colors duration-150",
          inbox.composerInput
        )}
      >
        <button
          type="button"
          onClick={() => documentInputRef.current?.click()}
          className={cn("grid size-9 place-items-center rounded-lg", inbox.hoverSubtle)}
          title="Adjuntar documento"
        >
          <Paperclip size={17} strokeWidth={1.7} className="text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          className={cn("grid size-9 place-items-center rounded-lg", inbox.hoverSubtle)}
          title="Adjuntar imagen"
        >
          <ImageIcon size={17} strokeWidth={1.7} className="text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={onToggleRecording}
          className={cn(
            "grid size-9 place-items-center rounded-lg",
            isRecording
              ? "animate-pulse bg-destructive/10 text-destructive"
              : cn("text-muted-foreground", inbox.hoverSubtle)
          )}
          title={isRecording ? "Detener grabación" : "Grabar nota de voz"}
        >
          <Mic size={17} strokeWidth={1.7} />
        </button>
        <button
          type="button"
          onClick={onImprove}
          disabled={!replyText.trim() || improving}
          className={cn(
            "grid size-9 place-items-center rounded-lg text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
            inbox.hoverSubtle
          )}
          title="Mejorar con IA"
        >
          <Wand2 size={17} strokeWidth={1.7} />
        </button>
        <input
          type="text"
          value={replyText}
          onChange={(e) => onReplyChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSend()}
          placeholder={
            pendingAttachments.length
              ? "Añadir mensaje (opcional)…"
              : "Escribe tu mensaje…"
          }
          className="min-h-11 flex-1 border-0 bg-transparent px-2 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground lg:min-h-10 lg:text-sm"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={(!replyText.trim() && !pendingAttachments.length) || sending}
          className="grid size-9 shrink-0 place-items-center rounded-full text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: "var(--primaryColor)" }}
          title="Enviar"
        >
          <Send size={16} strokeWidth={1.8} />
        </button>
      </div>
      {sendError && (
        <p className="mt-2 text-xs text-destructive">{sendError}</p>
      )}
    </div>
  );
}
