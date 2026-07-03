"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import {
  Search,
  Paperclip,
  ImageIcon,
  Mic,
  Bot,
  CheckCircle2,
  Send,
  Wand2,
  Info,
  ArrowLeft,
  Flag,
  UserRound,
  CornerUpLeft,
  RotateCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImageViewerModal, type ChatImageItem } from "@/components/inbox/image-viewer-modal";
import { ImagePreviewModal } from "@/components/inbox/image-preview-modal";
import { DocumentPreviewModal } from "@/components/inbox/document-preview-modal";
import { CustomAudioPlayer } from "@/components/inbox/custom-audio-player";
import { sileo } from "sileo";

const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

async function uploadToConvexStorage(
  generateUploadUrl: () => Promise<string>,
  file: File
): Promise<Id<"_storage">> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error("El archivo supera el límite de 15 MB para WhatsApp.");
  }
  const uploadUrl = await generateUploadUrl();
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: file.type ? { "Content-Type": file.type } : undefined,
    body: file,
  });
  if (!res.ok) {
    throw new Error(
      `No se pudo subir el archivo (${res.status}). Prueba con un PDF más liviano o en otro formato.`
    );
  }
  const data = (await res.json()) as { storageId?: string };
  if (!data.storageId) {
    throw new Error("Error al subir el archivo. Vuelve a intentarlo.");
  }
  return data.storageId as Id<"_storage">;
}
import { IntegrationBlockedBanner } from "@/components/integrations/integration-blocked-banner";
import { cn } from "@/lib/utils";

const DEFAULT_PRIMARY = "#dc2626";
const DEFAULT_SECONDARY = "#06b6d4";

const PRIORITY_LABELS = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
} as const;

const PRIORITY_DOT: Record<"low" | "normal" | "high" | "urgent", string> = {
  low: "#10b981",
  normal: "#f59e0b",
  high: "#f97316",
  urgent: "#dc2626",
};

type FilterMode = "all" | "bot" | "human" | "urgent";

function formatDateDivider(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

export default function InboxPage() {
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const [selectedConversationId, setSelectedConversationId] = useState<
    Id<"conversations"> | null
  >(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [retryingBot, setRetryingBot] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    { type: "image" | "audio" | "document"; file: File; preview?: string }[]
  >([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState<number | null>(null);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<File[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    conversationId: Id<"conversations">;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [improving, setImproving] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const tenant = useQuery(
    api.tenants.get,
    tenantId ? { tenantId } : "skip"
  );
  const ycloud = useQuery(
    api.integrations.getYCloud,
    tenantId ? { tenantId } : "skip"
  );
  const tenantConversations = useQuery(
    api.conversations.listByTenant,
    tenantId ? { tenantId } : "skip"
  );
  const activeMessages = useQuery(
    api.messages.listByConversation,
    selectedConversationId ? { conversationId: selectedConversationId } : "skip"
  );
  const members = useQuery(
    api.users.listByTenant,
    tenantId ? { tenantId } : "skip"
  );
  const needingAttention = useQuery(
    api.conversations.countNeedingAttention,
    tenantId ? { tenantId } : "skip"
  );
  const sendMessage = useAction(api.ycloud.sendWhatsAppMessage);
  const sendMedia = useAction(api.ycloud.sendWhatsAppMedia);
  const retryBotResponse = useAction(api.ycloud.retryBotResponse);
  const improveMessage = useAction(api.improveMessage.improve);
  const generateUploadUrl = useMutation(api.ycloud.generateMediaUploadUrl);
  const updatePriority = useMutation(api.conversations.updatePriority);
  const updateAssignedTo = useMutation(api.conversations.updateAssignedTo);
  const updateStatus = useMutation(api.conversations.updateStatus);

  const primaryColor = tenant?.primaryColor ?? DEFAULT_PRIMARY;
  const secondaryColor = tenant?.secondaryColor ?? DEFAULT_SECONDARY;

  const cssVars = useMemo(
    () =>
      ({
        "--primaryColor": primaryColor,
        "--primaryDark": `color-mix(in srgb, ${primaryColor} 78%, #1a1a2e)`,
        "--primarySoft": `color-mix(in srgb, ${primaryColor} 14%, white)`,
        "--primaryLight": `color-mix(in srgb, ${primaryColor} 8%, white)`,
        "--primaryFaint": `color-mix(in srgb, ${primaryColor} 4%, white)`,
        "--secondaryColor": secondaryColor,
      } as React.CSSProperties),
    [primaryColor, secondaryColor]
  );

  useEffect(() => {
    if (tenantConversations?.length && !selectedConversationId) {
      setSelectedConversationId(tenantConversations[0]._id);
    }
  }, [tenantConversations, selectedConversationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (isMobile && selectedConversationId) setSidebarOpen(false);
  }, [selectedConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages]);

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", closeContextMenu);
      return () => document.removeEventListener("click", closeContextMenu);
    }
  }, [contextMenu]);

  const prevNeedingAttentionRef = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const count = needingAttention ?? 0;
    const prev = prevNeedingAttentionRef.current;
    prevNeedingAttentionRef.current = count;
    if (prev !== null && count > prev && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("Inbox – Necesitan atención", {
          body: `${count} conversación(es) esperan asistencia de un humano`,
          icon: "/icons/ycloud.png",
        });
      }
    }
  }, [needingAttention]);

  const activeConversation = tenantConversations?.find(
    (c) => c._id === selectedConversationId
  );

  useEffect(() => {
    if (selectedConversationId && activeConversation && typeof window !== "undefined") {
      try {
        localStorage.setItem(
          `inbox-seen-${selectedConversationId}`,
          String(activeConversation.lastMessageAt)
        );
      } catch {
        /* ignore */
      }
    }
  }, [selectedConversationId, activeConversation]);

  const isBotMode = (c: { assignedTo?: Id<"users"> | null }) =>
    c.assignedTo == null || c.assignedTo === undefined;

  const hasPriority = (p: string | undefined | null): p is "low" | "normal" | "high" | "urgent" =>
    p === "low" || p === "normal" || p === "high" || p === "urgent";

  const counts = useMemo(() => {
    const list = tenantConversations ?? [];
    return {
      all: list.length,
      bot: list.filter((c) => isBotMode(c)).length,
      human: list.filter((c) => !isBotMode(c)).length,
      urgent: list.filter((c) => c.priority === "urgent" || c.priority === "high").length,
    };
  }, [tenantConversations]);

  const filteredConversations = useMemo(() => {
    let list = tenantConversations ?? [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.customerName.toLowerCase().includes(q) ||
          c.externalContactId.toLowerCase().includes(q)
      );
    }
    switch (filterMode) {
      case "bot":
        list = list.filter(isBotMode);
        break;
      case "human":
        list = list.filter((c) => !isBotMode(c));
        break;
      case "urgent":
        list = list.filter((c) => c.priority === "urgent" || c.priority === "high");
        break;
      default:
        break;
    }
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
    return [...list].sort((a, b) => {
      const aP = hasPriority(a.priority) ? priorityOrder[a.priority] : 4;
      const bP = hasPriority(b.priority) ? priorityOrder[b.priority] : 4;
      if (aP !== bP) return aP - bP;
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0);
    });
  }, [tenantConversations, filterMode, searchQuery]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) setSelectedImages(files);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) setSelectedDocuments(files);
    if (documentInputRef.current) documentInputRef.current.value = "";
  };

  const convertImageToJpeg = (file: File): Promise<File> => {
    const supported = ["image/jpeg", "image/png"];
    if (supported.includes(file.type)) return Promise.resolve(file);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("No se pudo convertir"));
              return;
            }
            const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
            resolve(new File([blob], name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.9
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error("Error al cargar imagen"));
      };
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !tenantId || !selectedConversationId) return;
    const getType = (file: File): "image" | "audio" | "document" => {
      if (file.type.startsWith("image/")) return "image";
      if (file.type.startsWith("audio/")) return "audio";
      return "document";
    };
    const newAttachments: { type: "image" | "audio" | "document"; file: File; preview?: string }[] = [];
    const audioOkTypes = ["audio/ogg", "audio/mpeg", "audio/mp3"];
    for (const file of files) {
      let finalFile = file;
      if (file.type.startsWith("audio/") && !audioOkTypes.some((t) => file.type.startsWith(t) || file.type === t)) {
        setSendError("Audio debe ser OGG o MP3. WebM/M4A pueden fallar con WhatsApp.");
        continue;
      }
      if (file.type.startsWith("image/") && !["image/jpeg", "image/png"].includes(file.type)) {
        try {
          finalFile = await convertImageToJpeg(file);
        } catch {
          setSendError("No se pudo convertir la imagen a JPEG");
          continue;
        }
      }
      newAttachments.push({
        type: getType(finalFile),
        file: finalFile,
        preview: finalFile.type.startsWith("image/") ? URL.createObjectURL(finalFile) : undefined,
      });
    }
    if (newAttachments.length) {
      setPendingAttachments((prev) => {
        const combined = [...prev, ...newAttachments];
        setPreviewIndex(combined.length - 1);
        return combined;
      });
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setPendingAttachments((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length) setPreviewIndex(Math.min(previewIndex, next.length - 1));
      else setPreviewIndex(0);
      prev[index]?.preview && URL.revokeObjectURL(prev[index].preview!);
      return next;
    });
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeTypes: { mime: string; ext: string }[] = [
        { mime: "audio/ogg; codecs=opus", ext: "ogg" },
        { mime: "audio/mp4", ext: "m4a" },
      ];
      const chosen = mimeTypes.find(({ mime }) => MediaRecorder.isTypeSupported(mime));
      if (!chosen) {
        setSendError("Tu navegador no graba en formato compatible con WhatsApp. Prueba Chrome o Firefox.");
        return;
      }
      const { mime: mimeType, ext } = chosen;
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size && audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (audioChunksRef.current.length) {
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          const file = new File([blob], `audio.${ext}`, { type: mimeType });
          setPendingAttachments((p) => [...p, { type: "audio", file }]);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      setSendError("No se pudo acceder al micrófono");
    }
  };

  const handleStopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  const handleImproveText = async () => {
    const t = replyText.trim();
    if (!t || improving) return;
    setImproving(true);
    try {
      const improved = await improveMessage({ text: t });
      setReplyText(improved);
    } catch {
      setSendError("No se pudo mejorar el texto");
    } finally {
      setImproving(false);
    }
  };

  const handleSendMessage = async () => {
    const text = replyText.trim();
    const hasAttachments = pendingAttachments.length > 0;
    if ((!text && !hasAttachments) || !tenantId || !selectedConversationId) return;
    setSending(true);
    setSendError(null);
    try {
      const active = tenantConversations?.find((c) => c._id === selectedConversationId);
      const wasBot = active && isBotMode(active);
      const userIdToAssign = (user?._id as Id<"users">) ?? members?.find((m) => m.user)?.user?._id;
      if (wasBot && userIdToAssign) {
        await updateAssignedTo({ conversationId: selectedConversationId, userId: userIdToAssign });
      }
      const attachmentCount = pendingAttachments.length;
      if (hasAttachments) {
        for (let i = 0; i < pendingAttachments.length; i++) {
          const att = pendingAttachments[i];
          const storageId = await uploadToConvexStorage(generateUploadUrl, att.file);
          await sendMedia({
            tenantId,
            conversationId: selectedConversationId,
            storageId,
            mediaType: att.type,
            caption: i === 0 && text ? text : undefined,
            contentType: att.file.type || undefined,
            fileName: att.type === "document" ? att.file.name : undefined,
          });
          if (att.preview) URL.revokeObjectURL(att.preview);
        }
        setPendingAttachments([]);
        setPreviewIndex(0);
      }
      if (text && !hasAttachments) {
        await sendMessage({
          tenantId,
          conversationId: selectedConversationId,
          content: text,
        });
      }
      setReplyText("");
      if (hasAttachments && text) {
        sileo.success({
          title: "Enviado por WhatsApp",
          description: `Mensaje y ${attachmentCount} archivo(s) enviados correctamente.`,
        });
      } else if (hasAttachments) {
        sileo.success({
          title: "Archivo(s) enviado(s)",
          description: `${attachmentCount} archivo(s) enviados por WhatsApp.`,
        });
      } else {
        sileo.success({
          title: "Mensaje enviado",
          description: "El mensaje se entregó por WhatsApp.",
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al enviar";
      setSendError(msg);
      sileo.error({ title: "No se pudo enviar", description: msg });
    } finally {
      setSending(false);
    }
  };

  const getHumanUserId = (): Id<"users"> | null => {
    if (user?._id) return user._id as Id<"users">;
    return (members?.find((m) => m.user)?.user?._id as Id<"users">) ?? null;
  };

  const handleSetMode = async (userId: Id<"users"> | null) => {
    if (!selectedConversationId) return;
    await updateAssignedTo({
      conversationId: selectedConversationId,
      userId,
    });
    if (userId === null) {
      await updateStatus({ conversationId: selectedConversationId, status: "open" });
    }
  };

  const handleRetryBot = async () => {
    if (!tenantId || !selectedConversationId) return;
    setRetryingBot(true);
    try {
      await retryBotResponse({
        tenantId,
        conversationId: selectedConversationId,
      });
      sileo.success({
        title: "Bot reprocesó la conversación",
        description: "Se envió una nueva respuesta al cliente por WhatsApp.",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo reintentar";
      sileo.error({ title: "Error al reintentar", description: msg });
    } finally {
      setRetryingBot(false);
    }
  };

  const handleSetPriority = async (
    p: "low" | "normal" | "high" | "urgent" | null
  ) => {
    const targetId = contextMenu?.conversationId ?? selectedConversationId;
    if (!targetId) return;
    await updatePriority({ conversationId: targetId, priority: p });
    setContextMenu(null);
  };

  const handleSetStatus = async (
    status: "open" | "closed" | "pending"
  ) => {
    const targetId = contextMenu?.conversationId ?? selectedConversationId;
    if (!targetId) return;
    await updateStatus({ conversationId: targetId, status });
    setContextMenu(null);
  };

  const handleContextMenuSetMode = async (userId: Id<"users"> | null) => {
    const targetId = contextMenu?.conversationId;
    if (!targetId) return;
    await updateAssignedTo({ conversationId: targetId, userId });
    if (userId === null) {
      await updateStatus({ conversationId: targetId, status: "open" });
    }
    setContextMenu(null);
  };

  const messageGroups = useMemo(() => {
    if (!activeMessages?.length) return [];
    const groups: { date: string; messages: typeof activeMessages }[] = [];
    let currentDate = "";
    let currentMessages: typeof activeMessages = [];
    activeMessages.forEach((msg) => {
      const dateKey = formatDateDivider(msg.createdAt);
      if (dateKey !== currentDate) {
        if (currentMessages.length) groups.push({ date: currentDate, messages: currentMessages });
        currentDate = dateKey;
        currentMessages = [msg];
      } else {
        currentMessages.push(msg);
      }
    });
    if (currentMessages.length) groups.push({ date: currentDate, messages: currentMessages });
    return groups;
  }, [activeMessages]);

  const mediaMessages = useMemo(
    () => activeMessages?.filter((m) => m.mediaUrl) ?? [],
    [activeMessages]
  );

  const chatImages: ChatImageItem[] = useMemo(
    () =>
      (activeMessages ?? [])
        .filter((m) => m.mediaType === "image" && m.mediaUrl)
        .map((m) => ({ url: m.mediaUrl!, text: m.content || "" })),
    [activeMessages]
  );

  const handleSendImages = async (items: { file: File; caption: string }[]) => {
    if (!tenantId || !selectedConversationId || !user) return;
    setSending(true);
    setSendError(null);
    try {
      const active = tenantConversations?.find((c) => c._id === selectedConversationId);
      const wasBot = active && isBotMode(active);
      const userIdToAssign = (user._id as Id<"users">) ?? members?.find((m) => m.user)?.user?._id;
      if (wasBot && userIdToAssign) {
        await updateAssignedTo({ conversationId: selectedConversationId, userId: userIdToAssign });
      }
      for (let i = 0; i < items.length; i++) {
        const { file, caption } = items[i]!;
        const storageId = await uploadToConvexStorage(generateUploadUrl, file);
        await sendMedia({
          tenantId,
          conversationId: selectedConversationId,
          storageId,
          mediaType: "image",
          caption: caption || undefined,
          contentType: file.type || undefined,
        });
      }
      setSelectedImages([]);
      sileo.success({
        title: "Imagen(es) enviada(s)",
        description: `${items.length} imagen(es) enviadas por WhatsApp.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al enviar";
      setSendError(msg);
      sileo.error({ title: "No se pudo enviar", description: msg });
    } finally {
      setSending(false);
    }
  };

  const handleSendDocuments = async (items: { file: File; caption: string }[]) => {
    if (!tenantId || !selectedConversationId || !user) return;
    setSending(true);
    setSendError(null);
    try {
      const active = tenantConversations?.find((c) => c._id === selectedConversationId);
      const wasBot = active && isBotMode(active);
      const userIdToAssign = (user._id as Id<"users">) ?? members?.find((m) => m.user)?.user?._id;
      if (wasBot && userIdToAssign) {
        await updateAssignedTo({ conversationId: selectedConversationId, userId: userIdToAssign });
      }
      for (let i = 0; i < items.length; i++) {
        const { file, caption } = items[i]!;
        const storageId = await uploadToConvexStorage(generateUploadUrl, file);
        await sendMedia({
          tenantId,
          conversationId: selectedConversationId,
          storageId,
          mediaType: "document",
          caption: caption || undefined,
          contentType: file.type || undefined,
          fileName: file.name,
        });
      }
      setSelectedDocuments([]);
      sileo.success({
        title: "Documento(s) enviado(s)",
        description: `${items.length} documento(s) enviados por WhatsApp.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al enviar";
      setSendError(msg);
      sileo.error({ title: "No se pudo enviar", description: msg });
    } finally {
      setSending(false);
    }
  };

  const conversationPhone = activeConversation
    ? activeConversation.externalContactId.replace(/^whatsapp:/, "")
    : null;

  if (!tenantId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-slate-500">Cargando...</p>
      </div>
    );
  }
  if (ycloud === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-slate-500">Cargando...</p>
      </div>
    );
  }
  if (!ycloud?.connected) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto p-6">
        <div
          className="mx-auto w-full max-w-2xl"
          style={{ "--primaryColor": primaryColor } as React.CSSProperties}
        >
          <IntegrationBlockedBanner
            message="Necesitas conectar WhatsApp o YCloud para usar el Inbox."
            integrationName="WhatsApp (YCloud)"
            primaryColor={primaryColor}
          />
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-slate-500">
              Una vez conectes YCloud en Integraciones, podrás recibir y enviar
              mensajes desde el Inbox.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const FILTERS: { id: FilterMode; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "bot", label: "Bot" },
    { id: "human", label: "Humano" },
    { id: "urgent", label: "Urgentes" },
  ];

  return (
    <div
      className="flex h-full min-h-0 w-full overflow-hidden bg-white font-[var(--font-jakarta)]"
      style={cssVars}
    >
      {/* Sidebar conv list */}
      <aside
        className={`shrink-0 flex flex-col border-r border-slate-200 min-w-[280px] md:min-w-[340px] transition-all duration-300 bg-white
          ${sidebarOpen ? "flex w-full md:w-[340px]" : "hidden md:flex md:w-[340px]"}`}
      >
        <header className="shrink-0 p-4 border-b border-slate-100">
          {/* Tab pills */}
          <div className="mb-3 rounded-xl bg-slate-100 p-[3px] grid grid-cols-4 h-9">
            {FILTERS.map((f) => {
              const active = filterMode === f.id;
              const c = counts[f.id];
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterMode(f.id)}
                  className={`rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1
                    ${active
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"}`}
                >
                  {f.label}
                  <span
                    className={`text-[10px] font-bold tabular-nums ${
                      active ? "text-slate-400" : "text-slate-400"
                    }`}
                  >
                    {c}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              size={15}
              strokeWidth={1.8}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cliente o número..."
              className="w-full h-9 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-(--primarySoft) focus:border-(--primaryColor) transition-shadow"
            />
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {filteredConversations.map((conv) => {
            const isActive = conv._id === selectedConversationId;
            const bot = isBotMode(conv);
            const isNew =
              mounted &&
              conv.lastMessageDirection === "INBOUND" &&
              conv._id !== selectedConversationId &&
              (() => {
                try {
                  const stored = localStorage.getItem(`inbox-seen-${conv._id}`);
                  const lastSeen = stored ? Number(stored) : 0;
                  return conv.lastMessageAt > lastSeen;
                } catch {
                  return false;
                }
              })();
            return (
              <button
                key={conv._id}
                type="button"
                onClick={() => setSelectedConversationId(conv._id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    conversationId: conv._id,
                  });
                }}
                className={cn(
                  "w-full text-left flex items-start gap-3 px-3 py-3 border-b border-slate-100 transition-colors hover:bg-slate-50/70",
                  isActive && "bg-(--primaryFaint)"
                )}
              >
                <div
                  className="shrink-0 size-10 rounded-xl grid place-items-center text-white text-sm font-bold shadow-sm"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--primaryColor), var(--primaryDark))",
                  }}
                >
                  {conv.customerName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span
                      className={cn(
                        "truncate text-[14px]",
                        isNew ? "font-bold text-slate-900" : "font-semibold text-slate-800"
                      )}
                    >
                      {conv.customerName}
                    </span>
                    <span
                      className={cn(
                        "text-[10.5px] tabular-nums shrink-0",
                        isNew ? "text-(--primaryColor) font-bold" : "text-slate-400"
                      )}
                    >
                      {new Date(conv.lastMessageAt).toLocaleTimeString("es", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="flex grow items-center gap-1 min-w-0">
                      {conv.lastMessageDirection === "OUTBOUND" && (
                        <CornerUpLeft
                          className="shrink-0 text-emerald-600"
                          size={11}
                          strokeWidth={2}
                        />
                      )}
                      <span className="truncate text-slate-500">
                        {conv.lastMessageDirection === "OUTBOUND" && (
                          <span className="text-emerald-600 font-medium">Tú: </span>
                        )}
                        {conv.lastMessagePreview || "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {conv.status === "pending" && (
                        <span
                          className="inline-flex items-center justify-center size-4 rounded-full bg-amber-100"
                          title="Necesita atención"
                        >
                          <span
                            className="size-1.5 rounded-full bg-amber-500"
                          />
                        </span>
                      )}
                      {hasPriority(conv.priority) && conv.status !== "pending" && (
                        <span
                          className="inline-flex items-center justify-center size-4 rounded-full"
                          style={{
                            background: `${PRIORITY_DOT[conv.priority]}25`,
                          }}
                          title={PRIORITY_LABELS[conv.priority]}
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ background: PRIORITY_DOT[conv.priority] }}
                          />
                        </span>
                      )}
                      <span
                        className={cn(
                          "inline-flex items-center justify-center size-5 rounded-full",
                          bot
                            ? "bg-emerald-100 text-emerald-600"
                            : "bg-(--primarySoft) text-(--primaryColor)"
                        )}
                        title={bot ? "Bot" : "Agente"}
                      >
                        {bot ? (
                          <Bot size={11} strokeWidth={2} />
                        ) : (
                          <UserRound size={11} strokeWidth={2} />
                        )}
                      </span>
                      {isNew && (
                        <span
                          className="size-2 rounded-full bg-(--primaryColor) ml-0.5"
                          title="Nuevo"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {(!tenantConversations || tenantConversations.length === 0) && (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-500">No hay conversaciones</p>
            </div>
          )}
        </div>
      </aside>

      {/* Chat */}
      <main
        className={cn(
          "flex-1 flex flex-col min-w-0 bg-slate-50/40",
          sidebarOpen ? "hidden md:flex" : "flex"
        )}
      >
        {activeConversation ? (
          <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden">
            <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
              {/* Header compacto */}
              <header className="shrink-0 px-4 py-2.5 border-b border-slate-200 bg-white flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="md:hidden size-8 rounded-lg flex items-center justify-center text-slate-500"
                >
                  <ArrowLeft size={16} />
                </button>
                <div
                  className="shrink-0 size-10 rounded-xl grid place-items-center text-white text-sm font-bold shadow-sm"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--primaryColor), var(--primaryDark))",
                  }}
                >
                  {activeConversation.customerName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-bold text-slate-900 truncate">
                    {activeConversation.customerName}
                  </h2>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate">
                    <span
                      className={cn(
                        "font-semibold",
                        activeConversation.status === "pending"
                          ? "text-amber-600"
                          : isBotMode(activeConversation)
                            ? "text-emerald-600"
                            : "text-(--primaryColor)"
                      )}
                    >
                      {activeConversation.status === "pending"
                        ? "Necesita atención"
                        : isBotMode(activeConversation)
                          ? "Bot IA"
                          : "Agente"}
                    </span>
                    <span>·</span>
                    <span>
                      {activeConversation.status === "open"
                        ? "Activo"
                        : activeConversation.status === "closed"
                          ? "Cerrado"
                          : "Pendiente"}
                    </span>
                    {conversationPhone && (
                      <>
                        <span>·</span>
                        <span className="truncate">{conversationPhone}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Bot/Agente toggle pill */}
                <button
                  type="button"
                  onClick={() =>
                    isBotMode(activeConversation)
                      ? handleSetMode(getHumanUserId())
                      : handleSetMode(null)
                  }
                  disabled={isBotMode(activeConversation) && !getHumanUserId()}
                  title={
                    activeConversation.status === "pending"
                      ? "Necesita atención humana"
                      : isBotMode(activeConversation)
                        ? "Bot activo - click para tomar control"
                        : "Click para activar el bot"
                  }
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all disabled:opacity-50",
                    activeConversation.status === "pending"
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                      : isBotMode(activeConversation)
                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        : "bg-(--primarySoft) text-(--primaryColor) hover:bg-(--primaryLight)"
                  )}
                >
                  {isBotMode(activeConversation) ? (
                    <Bot size={13} strokeWidth={2} />
                  ) : (
                    <UserRound size={13} strokeWidth={2} />
                  )}
                  {activeConversation.status === "pending"
                    ? "Atender"
                    : isBotMode(activeConversation)
                      ? "Bot activo"
                      : "Agente"}
                </button>

                {isBotMode(activeConversation) &&
                  activeConversation.status !== "closed" &&
                  activeConversation.channel === "whatsapp" && (
                    <button
                      type="button"
                      onClick={handleRetryBot}
                      disabled={retryingBot}
                      title="Reprocesar el último mensaje del cliente con el bot"
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors disabled:opacity-50"
                    >
                      <RotateCw
                        size={13}
                        strokeWidth={2}
                        className={cn(retryingBot && "animate-spin")}
                      />
                      {retryingBot ? "Reprocesando…" : "Reintentar bot"}
                    </button>
                  )}

                {/* Resolver */}
                {activeConversation.status !== "closed" ? (
                  <button
                    type="button"
                    onClick={() => handleSetStatus("closed")}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                    title="Marcar como resuelta"
                  >
                    <CheckCircle2 size={13} strokeWidth={2} />
                    Resolver
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSetStatus("open")}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Reabrir
                  </button>
                )}

                {/* Prioridad */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title="Prioridad"
                      className="shrink-0 size-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                      style={
                        hasPriority(activeConversation.priority)
                          ? { color: PRIORITY_DOT[activeConversation.priority] }
                          : undefined
                      }
                    >
                      <Flag size={16} strokeWidth={1.7} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Prioridad</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {hasPriority(activeConversation.priority) && (
                      <>
                        <DropdownMenuItem onClick={() => handleSetPriority(null)}>
                          Quitar prioridad
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {(["low", "normal", "high", "urgent"] as const).map((p) => (
                      <DropdownMenuItem key={p} onClick={() => handleSetPriority(p)}>
                        <span
                          className="size-2 rounded-full mr-2"
                          style={{ background: PRIORITY_DOT[p] }}
                        />
                        {PRIORITY_LABELS[p]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Info */}
                <button
                  type="button"
                  onClick={() => setShowContactInfo((x) => !x)}
                  className={cn(
                    "shrink-0 size-8 grid place-items-center rounded-lg transition-colors",
                    showContactInfo
                      ? "bg-(--primarySoft) text-(--primaryColor)"
                      : "text-slate-500 hover:bg-slate-100"
                  )}
                  title="Info de contacto"
                >
                  <Info size={16} strokeWidth={1.7} />
                </button>
              </header>

              {/* Mensajes */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                {messageGroups.map(({ date, messages }) => (
                  <div key={date} className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[11px] font-medium text-slate-400">
                        — {date} —
                      </span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                    <div className="space-y-3">
                      {messages.map((msg) => {
                        const isOutbound = msg.direction === "OUTBOUND";
                        return (
                          <div
                            key={msg._id}
                            className={cn(
                              "flex",
                              isOutbound ? "justify-end" : "justify-start"
                            )}
                          >
                            <div
                              className={cn(
                                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                                isOutbound
                                  ? "bg-(--primarySoft) text-slate-800"
                                  : "bg-white text-slate-800 border border-slate-200/70"
                              )}
                              style={
                                isOutbound
                                  ? {
                                      borderTopRightRadius: 6,
                                    }
                                  : {
                                      borderTopLeftRadius: 6,
                                    }
                              }
                            >
                              {msg.mediaUrl && (
                                <div className="mb-2 rounded-lg overflow-hidden">
                                  {msg.mediaType === "video" ? (
                                    <video
                                      src={msg.mediaUrl}
                                      controls
                                      className="max-h-64 w-full object-contain rounded"
                                    />
                                  ) : msg.mediaType === "document" ? (
                                    <div className="rounded-lg overflow-hidden border border-slate-200 bg-white">
                                      <div className="relative h-48 sm:h-56 bg-slate-50 overflow-hidden">
                                        <iframe
                                          src={`${msg.mediaUrl}#toolbar=0&navpanes=0&view=FitH`}
                                          className="absolute inset-0 w-full h-full border-0 bg-white"
                                          title="Vista previa PDF"
                                        />
                                      </div>
                                      <a
                                        href={msg.mediaUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors border-t border-slate-100"
                                      >
                                        <div
                                          className="shrink-0 size-11 rounded-lg grid place-items-center text-white font-bold text-xs"
                                          style={{ backgroundColor: "#E53935" }}
                                        >
                                          PDF
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-semibold text-slate-900 truncate">
                                            {msg.content && msg.content !== "Documento"
                                              ? msg.content
                                              : "Documento"}
                                          </p>
                                          <p className="text-[11px] text-slate-500">
                                            Toca para abrir
                                          </p>
                                        </div>
                                      </a>
                                    </div>
                                  ) : msg.mediaType === "audio" ? (
                                    <div className="-ml-1">
                                      <CustomAudioPlayer
                                        src={msg.mediaUrl}
                                        isContact={msg.direction === "INBOUND"}
                                        avatarSeed={
                                          msg.direction === "INBOUND"
                                            ? activeConversation.customerName
                                            : "Agente"
                                        }
                                        timestamp={new Date(msg.createdAt).toLocaleTimeString(
                                          "es",
                                          { hour: "2-digit", minute: "2-digit" }
                                        )}
                                      />
                                    </div>
                                  ) : (
                                    <div
                                      className="cursor-pointer overflow-hidden rounded-md max-w-sm"
                                      onClick={() => {
                                        const idx = chatImages.findIndex(
                                          (img) => img.url === msg.mediaUrl
                                        );
                                        setViewerInitialIndex(idx !== -1 ? idx : 0);
                                      }}
                                    >
                                      <img
                                        src={msg.mediaUrl}
                                        alt="Imagen adjunta"
                                        className="object-contain max-h-64 w-full"
                                      />
                                    </div>
                                  )}
                                </div>
                              )}
                              {(!msg.mediaUrl ||
                                (msg.content &&
                                  !["Imagen", "Video", "Audio", "Sticker", "Documento"].includes(
                                    msg.content
                                  ) &&
                                  msg.mediaType !== "document")) && (
                                <p className="whitespace-pre-wrap break-words leading-relaxed">
                                  {msg.content}
                                </p>
                              )}
                              <p className="mt-1 text-[10px] text-slate-400 tabular-nums">
                                {isOutbound && msg.isBot && (
                                  <span className="text-emerald-600 font-semibold mr-1">
                                    Bot ·
                                  </span>
                                )}
                                {new Date(msg.createdAt).toLocaleTimeString("es", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
                {activeMessages?.length === 0 && (
                  <div className="flex h-40 items-center justify-center">
                    <p className="text-sm text-slate-500">No hay mensajes aún</p>
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="shrink-0 border-t border-slate-200 bg-white p-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageChange}
                />
                <input
                  ref={documentInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  multiple
                  className="hidden"
                  onChange={handleDocumentChange}
                />

                {pendingAttachments.length > 0 && (
                  <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1">
                    {pendingAttachments.map((att, i) => (
                      <div key={i} className="relative shrink-0">
                        {att.type === "image" && att.preview ? (
                          <img
                            src={att.preview}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg border border-slate-200 bg-slate-50 grid place-items-center text-slate-400">
                            {att.type === "document" ? (
                              <Paperclip size={18} />
                            ) : (
                              <Mic size={18} />
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(i)}
                          className="absolute -top-1 -right-1 size-5 rounded-full bg-slate-800 text-white grid place-items-center text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 focus-within:ring-2 focus-within:ring-(--primarySoft) focus-within:border-(--primaryColor) transition-shadow">
                  <button
                    type="button"
                    onClick={() => documentInputRef.current?.click()}
                    className="size-9 rounded-lg grid place-items-center text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                    title="Adjuntar Documento"
                  >
                    <Paperclip size={17} strokeWidth={1.7} />
                  </button>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="size-9 rounded-lg grid place-items-center text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                    title="Adjuntar Imagen"
                  >
                    <ImageIcon size={17} strokeWidth={1.7} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      isRecording ? handleStopRecording() : handleStartRecording()
                    }
                    className={cn(
                      "size-9 rounded-lg grid place-items-center",
                      isRecording
                        ? "bg-red-100 text-red-600 animate-pulse"
                        : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                    )}
                    title={isRecording ? "Detener grabación" : "Grabar nota de voz"}
                  >
                    <Mic size={17} strokeWidth={1.7} />
                  </button>
                  <button
                    type="button"
                    onClick={handleImproveText}
                    disabled={!replyText.trim() || improving}
                    className="size-9 rounded-lg grid place-items-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Mejorar con IA"
                  >
                    <Wand2 size={17} strokeWidth={1.7} />
                  </button>
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !e.shiftKey && handleSendMessage()
                    }
                    placeholder={
                      pendingAttachments.length
                        ? "Añadir mensaje (opcional)…"
                        : "Escribe tu mensaje como operador..."
                    }
                    className="flex-1 min-h-[40px] py-2 px-2 bg-transparent border-0 outline-none text-sm text-slate-900 placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={(!replyText.trim() && !pendingAttachments.length) || sending}
                    className="shrink-0 size-9 rounded-lg grid place-items-center text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    style={{ background: "var(--primaryColor)" }}
                    title="Enviar"
                  >
                    <Send size={16} strokeWidth={1.8} />
                  </button>
                </div>
                {sendError && (
                  <p className="mt-2 text-xs text-red-600">{sendError}</p>
                )}
              </div>
            </div>

            {/* Panel info contacto */}
            {showContactInfo && (
              <aside className="w-72 shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 shrink-0">
                  <h3 className="text-sm font-bold text-slate-900">
                    Información de contacto
                  </h3>
                  <div className="mt-3 space-y-2 text-sm">
                    <p>
                      <span className="text-slate-500">Nombre: </span>
                      <span className="text-slate-900 font-medium">
                        {activeConversation.customerName}
                      </span>
                    </p>
                    <p>
                      <span className="text-slate-500">Canal: </span>
                      <span className="text-slate-900 font-medium">
                        {activeConversation.channel}
                      </span>
                    </p>
                    <p>
                      <span className="text-slate-500">Contacto: </span>
                      <span className="text-slate-900 font-medium">
                        {conversationPhone}
                      </span>
                    </p>
                    {hasPriority(activeConversation.priority) && (
                      <p>
                        <span className="text-slate-500">Prioridad: </span>
                        <span className="text-slate-900 font-medium">
                          {PRIORITY_LABELS[activeConversation.priority]}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Imágenes y videos
                  </h4>
                  {mediaMessages.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No hay archivos en esta conversación
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {mediaMessages.map((m) =>
                        m.mediaUrl ? (
                          <div
                            key={m._id}
                            className="rounded-lg overflow-hidden bg-white border border-slate-200"
                          >
                            {m.mediaType === "video" ? (
                              <video
                                src={m.mediaUrl}
                                className="w-full aspect-square object-cover"
                              />
                            ) : m.mediaType === "document" ? (
                              <a
                                href={m.mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex flex-col items-center justify-center p-3 aspect-square hover:bg-slate-50 group"
                              >
                                <div
                                  className="size-10 rounded grid place-items-center text-white font-bold text-xs"
                                  style={{ backgroundColor: "#E53935" }}
                                >
                                  PDF
                                </div>
                                <span className="text-[10px] truncate max-w-full mt-2 text-slate-600">
                                  {m.content || "Documento"}
                                </span>
                              </a>
                            ) : (
                              <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={m.mediaUrl}
                                  alt=""
                                  className="w-full aspect-square object-cover hover:opacity-95"
                                />
                              </a>
                            )}
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              </aside>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div
              className="size-16 rounded-2xl grid place-items-center mb-4"
              style={{
                background:
                  "linear-gradient(135deg, var(--primarySoft), var(--primaryLight))",
              }}
            >
              <Bot size={32} strokeWidth={1.5} style={{ color: "var(--primaryColor)" }} />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Bandeja de mensajes</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">
              Elige una conversación de la lista para empezar a chatear con tus
              clientes.
            </p>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="md:hidden mt-4 rounded-lg px-4 py-2 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Ver conversaciones
            </button>
          </div>
        )}

        {/* Modales */}
        {viewerInitialIndex !== null && chatImages.length > 0 && (
          <ImageViewerModal
            images={chatImages}
            initialIndex={viewerInitialIndex}
            onClose={() => setViewerInitialIndex(null)}
          />
        )}
        {selectedImages.length > 0 && activeConversation && (
          <ImagePreviewModal
            initialFiles={selectedImages}
            onClose={() => setSelectedImages([])}
            onSend={handleSendImages}
            isSending={sending}
          />
        )}
        {selectedDocuments.length > 0 && activeConversation && (
          <DocumentPreviewModal
            initialFiles={selectedDocuments}
            onClose={() => setSelectedDocuments([])}
            onSend={handleSendDocuments}
            isSending={sending}
          />
        )}

        {/* Menú contextual */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-[100] min-w-[210px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Acciones rápidas
            </div>
            <button
              type="button"
              onClick={() => handleSetStatus("closed")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left hover:bg-slate-100"
            >
              <CheckCircle2 size={15} className="text-emerald-600" strokeWidth={1.8} />
              Marcar como resuelta
            </button>
            <button
              type="button"
              onClick={() => handleSetStatus("open")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left hover:bg-slate-100"
            >
              Reabrir conversación
            </button>
            <div className="my-1 h-px bg-slate-100" />
            <button
              type="button"
              onClick={() => handleContextMenuSetMode(null)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left hover:bg-slate-100"
            >
              <Bot size={15} strokeWidth={1.8} />
              Cambiar a Bot
            </button>
            <button
              type="button"
              onClick={() => handleContextMenuSetMode(getHumanUserId())}
              disabled={!getHumanUserId()}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left hover:bg-slate-100 disabled:opacity-50 disabled:pointer-events-none"
            >
              <UserRound size={15} strokeWidth={1.8} />
              Cambiar a humano
            </button>
            <div className="my-1 h-px bg-slate-100" />
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Prioridad
            </div>
            {(["low", "normal", "high", "urgent"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSetPriority(p)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-left hover:bg-slate-100"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: PRIORITY_DOT[p] }}
                />
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
