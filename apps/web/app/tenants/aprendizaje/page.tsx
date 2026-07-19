"use client";

import { useAction, useQuery } from "convex/react";
import { useRequireModule } from "@/lib/use-require-module";
import { api } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  Mic,
  Volume2,
  VolumeX,
  Square,
  Copy,
  RefreshCw,
  FileText,
  Sparkles,
  Zap,
  Calendar,
  BarChart3,
  Speaker,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Confidence = "high" | "medium" | "low";

type Message = {
  role: "user" | "assistant";
  content: string;
  confidence?: Confidence;
  sources?: string[];
};

type HistoryItem = {
  id: string;
  date: number;
  query: string;
  reply: string;
  confidence: Confidence;
  sources: string[];
};

type VoiceConversationState =
  | "idle"
  | "greeting"
  | "listening"
  | "thinking"
  | "speaking";

const GREETING_TEXT = "Hola, pregúntame lo que quieras sobre la empresa.";
const SILENCE_MS = 1600;
const DAILY_LIMIT = 2000;
const HISTORY_STORAGE_PREFIX = "learning-history-";

const SUGGESTIONS = [
  "¿Con cuánto tiempo de anticipación debe llegar la mesera antes de su turno?",
  "¿A quién debe entregar el reporte de ventas al cerrar el turno?",
  "¿Qué elementos del uniforme son obligatorios según el procedimiento?",
];

function formatDaysAgo(ts: number | null): string {
  if (ts == null) return "—";
  const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (days === 0) return "Hoy";
  if (days === 1) return "Hace 1 día";
  return `Hace ${days} días`;
}

function confidenceLabel(c: Confidence): string {
  return c === "high" ? "Alta" : c === "medium" ? "Media" : "Baja";
}

function confidencePct(c: Confidence): number {
  return c === "high" ? 90 : c === "medium" ? 60 : 30;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

function loadHistoryFromStorage(
  tenantId: string,
  userId: string,
): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(
      `${HISTORY_STORAGE_PREFIX}${tenantId}-${userId}`,
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistoryToStorage(
  tenantId: string,
  userId: string,
  items: HistoryItem[],
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${HISTORY_STORAGE_PREFIX}${tenantId}-${userId}`,
      JSON.stringify(items),
    );
  } catch {
    // ignore
  }
}

export default function AprendizajePage() {
  useRequireModule("conocimiento");
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const ask = useAction(api.chatEmpresa.ask);
  const synthesize = useAction(api.elevenlabs.synthesize);
  const stats = useQuery(
    api.knowledge.getStats,
    tenantId ? { tenantId } : "skip",
  );
  const usage = useQuery(
    api.learning.getUsageToday,
    tenantId ? { tenantId } : "skip",
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Cargar historial persistido por usuario
  useEffect(() => {
    if (tenantId && user?._id) {
      setHistory(loadHistoryFromStorage(tenantId, user._id));
    } else {
      setHistory([]);
    }
  }, [tenantId, user?._id]);

  // Persistir historial al cambiar
  useEffect(() => {
    if (tenantId && user?._id && history.length > 0) {
      saveHistoryToStorage(tenantId, user._id, history);
    }
  }, [tenantId, user?._id, history]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [voiceConversation, setVoiceConversation] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceConversationState>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [lastExchange, setLastExchange] = useState<{
    user: string;
    assistant: string;
  } | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsBusyRef = useRef(false);
  const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceQueryRef = useRef("");
  const voiceActiveRef = useRef(false);
  const transcriptAccumulatorRef = useRef("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const playTTS = useCallback(
    async (text: string, onEnd?: () => void) => {
      if (ttsBusyRef.current) return;
      ttsBusyRef.current = true;
      setTtsBusy(true);
      try {
        const base64 = await synthesize({ text });
        if (!base64) {
          ttsBusyRef.current = false;
          setTtsBusy(false);
          onEnd?.();
          return;
        }
        const blob = new Blob(
          [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
          { type: "audio/mpeg" },
        );
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          ttsBusyRef.current = false;
          setTtsBusy(false);
          setPlayingId(null);
          onEnd?.();
        };
        await audio.play();
      } catch {
        ttsBusyRef.current = false;
        setTtsBusy(false);
        setPlayingId(null);
        onEnd?.();
      }
    },
    [synthesize],
  );

  const playAudio = useCallback(
    async (text: string, msgIndex: number) => {
      if (ttsBusyRef.current) return;
      setPlayingId(msgIndex);
      await playTTS(text);
    },
    [playTTS],
  );

  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setInput(
        (prev) => prev + " (El navegador no soporta reconocimiento de voz)",
      );
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "es-ES";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[e.resultIndex][0].transcript;
      setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startVoiceConversation = useCallback(() => {
    if (!tenantId) return;
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError(
        "Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.",
      );
      return;
    }
    voiceActiveRef.current = true;
    setVoiceError(null);
    setVoiceState("greeting");
    setVoiceTranscript("");
    playTTS(GREETING_TEXT, () => {
      if (!voiceActiveRef.current) return;
      setVoiceState("listening");
      startContinuousListening();
    });
  }, [tenantId, playTTS]);

  const startContinuousListening = useCallback(() => {
    if (!voiceActiveRef.current) return;
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = true;
    transcriptAccumulatorRef.current = "";

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let full = "";
      for (let i = 0; i < e.results.length; i++) {
        const item = e.results[i][0];
        const text = item.transcript;
        full += text;
        if (e.results[i].isFinal) {
          transcriptAccumulatorRef.current += text;
        }
      }
      const toShow = transcriptAccumulatorRef.current || full;
      setVoiceTranscript(toShow);

      if (transcriptAccumulatorRef.current.trim()) {
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = setTimeout(() => {
          silenceTimeoutRef.current = null;
          voiceQueryRef.current = transcriptAccumulatorRef.current.trim();
          transcriptAccumulatorRef.current = "";
          recognition.stop();
        }, SILENCE_MS);
      }
    };

    recognition.onend = () => {
      const toSend = voiceQueryRef.current.trim();
      voiceQueryRef.current = "";
      recognitionRef.current = null;

      if (!voiceActiveRef.current) return;

      if (toSend && tenantId) {
        setVoiceState("thinking");
        setVoiceTranscript("");
        ask({ tenantId, query: toSend })
          .then((result) => {
            if (!voiceActiveRef.current) return;
            const text = result.text;
            setMessages((prev) => [
              ...prev,
              { role: "user", content: toSend },
              {
                role: "assistant",
                content: text,
                confidence: result.confidence,
                sources: result.sources ?? [],
              },
            ]);
            setLastExchange({ user: toSend, assistant: text });
            setHistory((prev) => [
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                date: Date.now(),
                query: toSend,
                reply: text,
                confidence: result.confidence,
                sources: result.sources ?? [],
              },
              ...prev.slice(0, 49),
            ]);
            setVoiceState("speaking");
            setPlayingId(-1);
            playTTS(text, () => {
              if (!voiceActiveRef.current) return;
              setVoiceState("listening");
              startContinuousListening();
            });
          })
          .catch(() => {
            if (!voiceActiveRef.current) return;
            setVoiceError("Error al obtener respuesta. Intenta de nuevo.");
            setVoiceState("listening");
            startContinuousListening();
          });
      } else {
        setVoiceState("listening");
        startContinuousListening();
      }
    };

    recognition.onerror = (e: Event) => {
      recognitionRef.current = null;
      const err = e as { error?: string };
      if (err.error === "not-allowed") {
        setVoiceError(
          "Permiso de micrófono denegado. Actívalo en el navegador.",
        );
        voiceActiveRef.current = false;
        setVoiceState("idle");
        return;
      }
      if (!voiceActiveRef.current) return;
      setVoiceState("listening");
      startContinuousListening();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setVoiceError("No se pudo iniciar el micrófono.");
    }
  }, [tenantId, ask, playTTS]);

  const stopVoiceConversation = useCallback(() => {
    voiceActiveRef.current = false;
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    ttsBusyRef.current = false;
    setTtsBusy(false);
    setPlayingId(null);
    transcriptAccumulatorRef.current = "";
    voiceQueryRef.current = "";
    setVoiceConversation(false);
    setVoiceState("idle");
    setVoiceTranscript("");
    setVoiceError(null);
  }, []);

  const handleSubmit = async (e?: React.FormEvent, suggestedQuery?: string) => {
    e?.preventDefault();
    const q = (suggestedQuery ?? input.trim()).trim();
    if (!q || !tenantId || loading) return;

    const usageToday = usage?.count ?? 0;
    if (usageToday >= DAILY_LIMIT) {
      setSubmitError(
        `Límite diario alcanzado (${DAILY_LIMIT} créditos). Vuelve mañana.`,
      );
      return;
    }

    setSubmitError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);
    try {
      const result = await ask({ tenantId, query: q });
      const replyMsg: Message = {
        role: "assistant",
        content: result.text,
        confidence: result.confidence,
        sources: result.sources ?? [],
      };
      setMessages((prev) => [...prev, replyMsg]);
      setHistory((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          date: Date.now(),
          query: q,
          reply: result.text,
          confidence: result.confidence,
          sources: result.sources ?? [],
        },
        ...prev.slice(0, 49),
      ]);
      if (voiceMode && !ttsBusyRef.current) {
        setTimeout(() => playTTS(result.text), 100);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al obtener respuesta.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${msg}` },
      ]);
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  const openHistoryItem = (item: HistoryItem) => {
    setMessages([
      { role: "user", content: item.query },
      {
        role: "assistant",
        content: item.reply,
        confidence: item.confidence,
        sources: item.sources,
      },
    ]);
    setHistoryOpen(false);
  };

  const deleteHistoryItem = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    setHistory((prev) => prev.filter((h) => h.id !== itemId));
    // Si la conversación abierta es la eliminada, limpiar mensajes
    const deleted = history.find((h) => h.id === itemId);
    if (deleted && messages.length === 2 && messages[0]?.content === deleted.query) {
      setMessages([]);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const regenerateReply = async (msgIndex: number) => {
    const userMsg = messages[msgIndex - 1];
    if (userMsg?.role !== "user" || !tenantId || loading) return;
    if ((usage?.count ?? 0) >= DAILY_LIMIT) {
      setSubmitError(`Límite diario (${DAILY_LIMIT}) alcanzado.`);
      return;
    }
    setSubmitError(null);
    setMessages((prev) => prev.slice(0, msgIndex));
    setLoading(true);
    try {
      const result = await ask({ tenantId, query: userMsg.content });
      const replyMsg: Message = {
        role: "assistant",
        content: result.text,
        confidence: result.confidence,
        sources: result.sources ?? [],
      };
      setMessages((prev) => [...prev, replyMsg]);
      setHistory((prev) => [
        {
          id: `${Date.now()}`,
          date: Date.now(),
          query: userMsg.content,
          reply: result.text,
          confidence: result.confidence,
          sources: result.sources ?? [],
        },
        ...prev.slice(0, 49),
      ]);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Error al regenerar.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-muted/40/50">
      {/* Encabezado premium */}

      {voiceConversation ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-0">
          <div
            className={cn(
              "w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300",
              voiceState === "listening" && "animate-pulse",
              voiceState === "speaking" && "animate-pulse",
            )}
            style={{
              backgroundColor:
                voiceState === "listening"
                  ? "var(--primarySoft)"
                  : voiceState === "speaking"
                    ? "var(--primarySoft)"
                    : voiceState === "thinking"
                      ? "var(--primarySoft)"
                      : "var(--primarySoft)",
              transform:
                voiceState === "listening" ? "scale(1.05)" : "scale(1)",
            }}
          >
            {voiceState === "idle" && (
              <button
                type="button"
                onClick={startVoiceConversation}
                disabled={!tenantId}
                className="size-full rounded-full flex items-center justify-center hover:opacity-90 transition-opacity"
                style={{ color: "var(--primaryColor)" }}
                title="Empezar a hablar"
              >
                <Mic className="h-16 w-16" />
              </button>
            )}
            {(voiceState === "greeting" || voiceState === "speaking") && (
              <div className="flex gap-1 items-end">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-(--primaryColor) animate-voice-bar origin-bottom"
                    style={{ height: "24px", animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
            )}
            {voiceState === "thinking" && (
              <Loader2
                className="h-12 w-12 animate-spin"
                style={{ color: "var(--primaryColor)" }}
              />
            )}
            {voiceState === "listening" && (
              <div className="flex gap-1 items-end">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-(--primaryColor) animate-voice-bar-slow origin-bottom"
                    style={{ height: "20px", animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            )}
          </div>
          {voiceError && (
            <p className="mt-4 text-sm text-red-600 text-center max-w-xs bg-red-50 px-3 py-2 rounded-lg">
              {voiceError}
            </p>
          )}
          <p className="mt-6 text-sm text-muted-foreground text-center max-w-xs">
            {voiceState === "idle" &&
              "Toca el micrófono para empezar. Habla y el asistente te responderá por voz."}
            {voiceState === "greeting" && "Iniciando..."}
            {voiceState === "listening" &&
              (voiceTranscript
                ? `"${voiceTranscript}"`
                : "Escuchando... habla ahora.")}
            {voiceState === "thinking" && "Pensando..."}
            {voiceState === "speaking" && "Respondiendo..."}
          </p>
          {lastExchange && (
            <div className="mt-4 w-full max-w-md text-center space-y-1">
              <p
                className="text-xs text-muted-foreground truncate"
                title={lastExchange.user}
              >
                Tú: {lastExchange.user}
              </p>
              <p
                className="text-xs text-muted-foreground truncate"
                title={lastExchange.assistant}
              >
                Asistente: {lastExchange.assistant}
              </p>
            </div>
          )}
          <div className="mt-6 flex flex-col items-center gap-3">
            {(voiceState === "listening" ||
              voiceState === "thinking" ||
              voiceState === "speaking" ||
              voiceState === "greeting") && (
              <button
                type="button"
                onClick={stopVoiceConversation}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors"
              >
                <Square className="h-4 w-4" />
                Parar
              </button>
            )}
            <button
              type="button"
              onClick={stopVoiceConversation}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Salir de conversación por voz
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative flex min-h-0 flex-1">
            {historyOpen && (
              <button
                type="button"
                className="absolute inset-0 z-30 bg-black/40 md:hidden"
                aria-label="Cerrar historial"
                onClick={() => setHistoryOpen(false)}
              />
            )}
            {/* Columna izquierda: historial */}
            <aside
              className={cn(
                "z-40 flex w-[min(280px,85vw)] shrink-0 flex-col overflow-hidden border-r border-border bg-card/80 transition-transform duration-200 md:relative md:z-auto md:w-64 md:translate-x-0",
                historyOpen
                  ? "absolute inset-y-0 left-0 translate-x-0 shadow-md"
                  : "absolute inset-y-0 left-0 -translate-x-full md:flex"
              )}
            >
              <div className="p-3 border-b border-border space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setLastExchange(null);
                    setHistoryOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: "var(--primarySoft)",
                    color: "var(--primaryColor)",
                  }}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  Nueva conversación
                </button>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-1">
                  Historial reciente
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">
                    Aún no hay preguntas
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {history.slice(0, 20).map((item) => (
                      <li key={item.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => openHistoryItem(item)}
                          className="w-full text-left rounded-lg p-2.5 pr-8 hover:bg-muted/40 border border-transparent hover:border-border transition-colors"
                        >
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(item.date).toLocaleDateString("es", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p
                            className="text-sm text-foreground truncate mt-0.5"
                            title={item.query}
                          >
                            {item.query}
                          </p>
                          <div className="flex items-center justify-between mt-1">
                            <span
                              className={cn(
                                "text-[10px] font-medium",
                                item.confidence === "high"
                                  ? "text-emerald-600"
                                  : item.confidence === "medium"
                                    ? "text-amber-600"
                                    : "text-muted-foreground",
                              )}
                            >
                              {confidencePct(item.confidence)}%
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Reabrir
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => deleteHistoryItem(e, item.id)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>

            {/* Columna derecha: chat */}
            <main className="flex min-w-0 flex-1 flex-col bg-card md:rounded-l-xl md:shadow-sm">
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 md:hidden">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Historial
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setLastExchange(null);
                  }}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium"
                  style={{
                    backgroundColor: "var(--primarySoft)",
                    color: "var(--primaryColor)",
                  }}
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  Nueva
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
                {messages.length === 0 && !loading && (
                  <div className="flex flex-col items-center justify-center min-h-[280px] text-center">
                    <div
                      className="size-20 rounded-2xl flex items-center justify-center mb-5 opacity-90"
                      style={{ backgroundColor: "var(--primarySoft)" }}
                    >
                      <Sparkles
                        className="h-10 w-10"
                        style={{ color: "var(--primaryColor)" }}
                      />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground">
                      ¿Qué quieres saber hoy?
                    </h3>
                    <p className="text-muted-foreground mt-1 mb-6 max-w-sm">
                      Escribe o elige una sugerencia. La IA responde con tu base
                      de conocimiento.
                    </p>
                    <div className="flex max-w-full flex-wrap justify-center gap-2 px-1">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleSubmit(undefined, s)}
                          disabled={
                            loading || (usage?.count ?? 0) >= DAILY_LIMIT
                          }
                          className="max-w-full rounded-full border border-border bg-card px-3 py-2 text-left text-xs leading-snug transition-colors hover:border-(--primaryColor) hover:bg-muted/40 sm:px-4 sm:text-sm"
                          style={{ color: "var(--primaryColor)" }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex",
                      m.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm",
                        m.role === "user"
                          ? "text-white"
                          : "bg-muted/40 text-foreground border border-border",
                      )}
                      style={
                        m.role === "user"
                          ? { backgroundColor: "var(--primaryColor)" }
                          : undefined
                      }
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                      {m.role === "assistant" && (
                        <>
                          {m.confidence != null && (
                            <div className="mt-3 pt-3 border-t border-border/60">
                              <p className="text-[10px] text-muted-foreground mb-1">
                                Confianza: {confidenceLabel(m.confidence)}
                              </p>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${confidencePct(m.confidence)}%`,
                                    backgroundColor:
                                      m.confidence === "high"
                                        ? "var(--primaryColor)"
                                        : m.confidence === "medium"
                                          ? "#f59e0b"
                                          : "#94a3b8",
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          {m.sources && m.sources.length > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {m.sources.slice(0, 2).join(", ")}
                              {m.sources.length > 2 &&
                                ` +${m.sources.length - 2}`}
                            </p>
                          )}
                          <div className="flex items-center gap-1 mt-3 flex-wrap">
                            <button
                              type="button"
                              onClick={() => playAudio(m.content, i)}
                              disabled={
                                ttsBusy ||
                                (playingId !== null && playingId !== i) ||
                                playingId === -1
                              }
                              className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                              title="Reproducir"
                            >
                              <Volume2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(m.content)}
                              className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                              title="Copiar"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => regenerateReply(i)}
                              disabled={loading}
                              className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                              title="Regenerar"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                            {m.sources && m.sources.length > 0 && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <FileText className="h-3 w-3" />
                                Fuentes
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl px-4 py-3 bg-muted border border-border">
                      <span className="flex gap-1">
                        {[0, 1, 2].map((j) => (
                          <span
                            key={j}
                            className="w-1.5 h-1.5 rounded-full bg-muted/400 animate-bounce"
                            style={{ animationDelay: `${j * 0.15}s` }}
                          />
                        ))}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        IA pensando…
                      </span>
                    </div>
                  </div>
                )}
                <div ref={scrollRef} />
              </div>

              {/* Input avanzado */}
              <footer className="shrink-0 border-t border-border bg-muted/40 p-3 sm:p-4">
                {submitError && (
                  <p className="text-sm text-red-600 mb-2 px-1">
                    {submitError}
                  </p>
                )}
                <form
                  onSubmit={(e) => handleSubmit(e)}
                  className="flex items-end gap-2 p-2 rounded-xl bg-card border border-border shadow-sm focus-within:ring-2 focus-within:ring-offset-2 transition-shadow focus-within:ring-(--primaryColor)"
                >
                  <button
                    type="button"
                    onClick={isListening ? stopListening : startListening}
                    disabled={loading || (usage?.count ?? 0) >= DAILY_LIMIT}
                    className={cn(
                      "size-10 shrink-0 rounded-lg flex items-center justify-center transition-colors",
                      isListening
                        ? "bg-red-100 text-red-600"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                    title={isListening ? "Detener" : "Hablar"}
                  >
                    <Mic
                      className={cn("h-5 w-5", isListening && "animate-pulse")}
                    />
                  </button>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !e.shiftKey && handleSubmit(e)
                    }
                    placeholder="Pregunta algo sobre tu negocio…"
                    className="flex-1 min-h-[44px] py-2 px-3 bg-transparent border-none text-foreground text-sm placeholder:text-muted-foreground focus:outline-none"
                    disabled={
                      !tenantId || loading || (usage?.count ?? 0) >= DAILY_LIMIT
                    }
                  />
                  <button
                    type="submit"
                    disabled={
                      !input.trim() ||
                      !tenantId ||
                      loading ||
                      (usage?.count ?? 0) >= DAILY_LIMIT
                    }
                    className="size-10 shrink-0 rounded-lg flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    style={{ backgroundColor: "var(--primaryColor)" }}
                    title="Enviar"
                  >
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoiceConversation((v) => !v)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      voiceConversation
                        ? "text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted",
                    )}
                    style={
                      voiceConversation
                        ? { backgroundColor: "var(--primaryColor)" }
                        : undefined
                    }
                  >
                    <Speaker className="h-4 w-4" />
                  </button>
                </form>
              </footer>
            </main>
          </div>
        </>
      )}
    </div>
  );
}
