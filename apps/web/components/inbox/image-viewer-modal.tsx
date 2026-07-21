"use client";

import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface ChatImageItem {
  url: string;
  text?: string;
}

interface ImageViewerModalProps {
  images: ChatImageItem[];
  initialIndex: number;
  onClose: () => void;
}

export function ImageViewerModal({
  images,
  initialIndex = 0,
  onClose,
}: ImageViewerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight")
        setCurrentIndex((p) => (p + 1) % images.length);
      if (e.key === "ArrowLeft")
        setCurrentIndex((p) => (p - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, images.length]);

  if (!images || images.length === 0 || !mounted) return null;

  const handleNext = () => setCurrentIndex((p) => (p + 1) % images.length);
  const handlePrev = () =>
    setCurrentIndex((p) => (p - 1 + images.length) % images.length);

  const current = images[currentIndex]!;

  return createPortal(
    <div className="fixed inset-0 z-100 flex flex-col bg-black/90 animate-in fade-in duration-200">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 px-4">
        <p className="text-sm font-medium text-white/90">Vista ampliada</p>
        <div className="flex items-center gap-2">
          {images.length > 1 && (
            <span className="text-sm text-white/70">
              {currentIndex + 1} / {images.length}
            </span>
          )}
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-10 w-10 rounded-full p-0 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {images.length > 1 && (
          <>
            <Button
              variant="ghost"
              onClick={handlePrev}
              className="absolute left-3 top-1/2 z-110 hidden h-12 w-12 -translate-y-1/2 rounded-full p-0 text-white/70 hover:bg-white/10 hover:text-white sm:flex"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-8 w-8" />
            </Button>
            <Button
              variant="ghost"
              onClick={handleNext}
              className="absolute right-3 top-1/2 z-110 hidden h-12 w-12 -translate-y-1/2 rounded-full p-0 text-white/70 hover:bg-white/10 hover:text-white sm:flex"
              aria-label="Siguiente"
            >
              <ChevronRight className="h-8 w-8" />
            </Button>
          </>
        )}

        {/* Scroll para imágenes altas: se ve el pedazo de abajo */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-10"
          onClick={onClose}
        >
          <div
            className="mx-auto flex min-h-full w-full max-w-5xl items-start justify-center py-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.url}
              src={current.url}
              alt={`Imagen ${currentIndex + 1}`}
              className="h-auto w-full max-w-full select-none object-contain shadow-2xl animate-in fade-in duration-300"
            />
          </div>
        </div>

        {current.text ? (
          <div className="shrink-0 border-t border-white/10 px-4 py-3 text-center text-sm text-white/90 md:text-base">
            {current.text}
          </div>
        ) : null}

        {images.length > 1 && (
          <div className="shrink-0 border-t border-white/10 px-4 py-3">
            <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 overflow-x-auto pb-1">
              {images.map((img, idx) => (
                <button
                  key={img.url + idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    "relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-md border-2 transition-all",
                    currentIndex === idx
                      ? "scale-100 border-white"
                      : "scale-95 border-transparent opacity-50 hover:opacity-100"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt=""
                    className="h-full w-full object-cover select-none pointer-events-none"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
