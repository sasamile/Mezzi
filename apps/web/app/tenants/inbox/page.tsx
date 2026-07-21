"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import {
  useQuery,
  usePaginatedQuery,
  useAction,
  useMutation,
} from "convex/react";
import { api } from "@/convex";
import type { Doc, Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import {
  Bot,
  CheckCircle2,
  UserRound,
  MessageSquare,
} from "lucide-react";
import { ImageViewerModal, type ChatImageItem } from "@/components/inbox/image-viewer-modal";
import { ImagePreviewModal } from "@/components/inbox/image-preview-modal";
import { DocumentPreviewModal } from "@/components/inbox/document-preview-modal";
import { MessageMedia } from "@/components/inbox/message-media";
import { ConversationsLayout } from "@/components/inbox/conversations-layout";
import {
  ConversationsListEmpty,
  ConversationsListHeader,
  ConversationsListSkeleton,
  type FilterMode,
} from "@/components/inbox/conversations-list";
import {
  ConversationHeader,
  PRIORITY_DOT,
  PRIORITY_LABELS,
} from "@/components/inbox/conversation-header";
import { ConversationComposer } from "@/components/inbox/conversation-composer";
import {
  FoldersRail,
  type FolderSelection,
} from "@/components/inbox/folders-rail";
import { FolderManagerModal } from "@/components/inbox/folder-manager-modal";
import { ConversationListItem } from "@/components/inbox/conversation-list-item";
import { UNCLASSIFIED, folderIcon } from "@/lib/inbox-folders";
import { Check } from "lucide-react";
import { inbox } from "@/components/inbox/inbox-theme";
import {
  resolvePrimaryColor,
  resolveSecondaryColor,
  tenantThemeCssVars,
} from "@/lib/tenant-theme";
import { sileo } from "@/lib/toast";

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
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>(null);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  /** Mensajes más antiguos que la ventana reactiva reciente */
  const [olderMessages, setOlderMessages] = useState<Doc<"messages">[]>([]);
  const [olderCursor, setOlderCursor] = useState<number | undefined>(undefined);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const skipAutoScrollRef = useRef(false);
  const lastMergedOlderCursorRef = useRef<number | undefined>(undefined);

  const PAGE_SIZE = 40;
  const MESSAGE_PAGE_SIZE = 50;

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
  const {
    results: tenantConversations = [],
    status: conversationsStatus,
    loadMore: loadMoreConversations,
  } = usePaginatedQuery(
    api.conversations.listByTenantPaginated,
    tenantId
      ? { tenantId, userId: (user?._id as Id<"users">) ?? undefined }
      : "skip",
    { initialNumItems: PAGE_SIZE }
  );
  const conversationsLoading = conversationsStatus === "LoadingFirstPage";
  const canLoadMoreConversations =
    conversationsStatus === "CanLoadMore" ||
    conversationsStatus === "LoadingMore";
  const folders = useQuery(
    api.conversationFolders.listByTenant,
    tenantId ? { tenantId } : "skip"
  );
  const membership = useQuery(
    api.users.getMembershipByTenantAndUser,
    tenantId && user?._id
      ? { tenantId, userId: user._id as Id<"users"> }
      : "skip"
  );
  const recentMessagesPage = useQuery(
    api.messages.listRecentByConversation,
    selectedConversationId
      ? { conversationId: selectedConversationId, limit: MESSAGE_PAGE_SIZE }
      : "skip"
  );
  const olderMessagesPage = useQuery(
    api.messages.listRecentByConversation,
    selectedConversationId && olderCursor != null
      ? {
          conversationId: selectedConversationId,
          limit: MESSAGE_PAGE_SIZE,
          before: olderCursor,
        }
      : "skip"
  );
  const selectedConversationDoc = useQuery(
    api.conversations.get,
    selectedConversationId
      ? { conversationId: selectedConversationId }
      : "skip"
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
  const toggleConversationFolder = useMutation(
    api.conversationFolders.toggleConversationFolder
  );

  const primaryColor = resolvePrimaryColor(tenant?.primaryColor);
  const secondaryColor = resolveSecondaryColor(tenant?.secondaryColor);
  const cssVars = useMemo(
    () => tenantThemeCssVars(primaryColor, secondaryColor),
    [primaryColor, secondaryColor]
  );

  useEffect(() => {
    if (tenantConversations.length && !selectedConversationId) {
      setSelectedConversationId(tenantConversations[0]._id);
    }
  }, [tenantConversations, selectedConversationId]);

  useEffect(() => {
    setOlderMessages([]);
    setOlderCursor(undefined);
    setHasMoreOlder(false);
    setLoadingOlder(false);
    lastMergedOlderCursorRef.current = undefined;
  }, [selectedConversationId]);

  useEffect(() => {
    if (
      recentMessagesPage &&
      olderMessages.length === 0 &&
      olderCursor == null
    ) {
      setHasMoreOlder(recentMessagesPage.hasMore);
    }
  }, [
    recentMessagesPage,
    olderMessages.length,
    olderCursor,
    selectedConversationId,
  ]);

  useEffect(() => {
    if (!olderMessagesPage || olderCursor == null) return;
    if (lastMergedOlderCursorRef.current === olderCursor) return;
    lastMergedOlderCursorRef.current = olderCursor;
    const scrollEl = messagesScrollRef.current;
    const prevHeight = scrollEl?.scrollHeight ?? 0;
    setOlderMessages((prev) => {
      const ids = new Set(prev.map((m) => m._id));
      const incoming = olderMessagesPage.messages.filter((m) => !ids.has(m._id));
      return [...incoming, ...prev];
    });
    setHasMoreOlder(olderMessagesPage.hasMore);
    setLoadingOlder(false);
    skipAutoScrollRef.current = true;
    requestAnimationFrame(() => {
      if (scrollEl) {
        scrollEl.scrollTop = scrollEl.scrollHeight - prevHeight;
      }
    });
  }, [olderMessagesPage, olderCursor]);

  const activeMessages = useMemo(() => {
    const recent = recentMessagesPage?.messages ?? [];
    const recentIds = new Set(recent.map((m) => m._id));
    const older = olderMessages.filter((m) => !recentIds.has(m._id));
    return [...older, ...recent];
  }, [recentMessagesPage, olderMessages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (isMobile && selectedConversationId) setSidebarOpen(false);
  }, [selectedConversationId]);

  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    if (loadingOlder) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages, loadingOlder]);

  useEffect(() => {
    if (!contextMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return;
      setContextMenu(null);
    };
    // Evitar que el mismo gesto que abre el menú lo cierre al instante.
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [contextMenu]);

  // Mantener el menú contextual dentro del viewport y con scroll si hace falta.
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let x = contextMenu.x;
    let y = contextMenu.y;
    if (x + rect.width > window.innerWidth - pad) {
      x = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    if (x !== contextMenu.x || y !== contextMenu.y) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
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

  const activeConversation =
    tenantConversations.find((c) => c._id === selectedConversationId) ??
    selectedConversationDoc ??
    undefined;

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

  /** Conversaciones visibles según carpeta (antes de filtro bot/humano/urgente). */
  const folderScopedConversations = useMemo(() => {
    let list = tenantConversations;
    if (selectedFolder === UNCLASSIFIED) {
      return list.filter((c) => (c.folderIds ?? []).length === 0);
    }
    if (selectedFolder != null && selectedFolder !== "") {
      return list.filter((c) =>
        (c.folderIds ?? []).some((id) => String(id) === String(selectedFolder))
      );
    }
    return list;
  }, [tenantConversations, selectedFolder]);

  const counts = useMemo(() => {
    const list = folderScopedConversations;
    return {
      all: list.length,
      bot: list.filter((c) => isBotMode(c)).length,
      human: list.filter((c) => !isBotMode(c)).length,
      urgent: list.filter((c) => c.priority === "urgent" || c.priority === "high").length,
    };
  }, [folderScopedConversations]);

  const isAdminLike =
    membership?.role === "OWNER" || membership?.role === "ADMIN";
  const canManageFolders = isAdminLike;
  const accessibleFolders = useMemo(() => {
    const all = folders ?? [];
    const allowed = membership?.allowedFolders;
    if (isAdminLike || !allowed) return all;
    const allowedSet = new Set(allowed);
    return all.filter((f) => allowedSet.has(f._id));
  }, [folders, membership, isAdminLike]);
  const showUnclassified = useMemo(() => {
    const allowed = membership?.allowedFolders;
    if (isAdminLike || !allowed) return true;
    return allowed.includes(UNCLASSIFIED);
  }, [membership, isAdminLike]);

  const folderCounts = useMemo(() => {
    const list = tenantConversations;
    const counts: Record<string, number> = {};
    let unclassified = 0;
    for (const c of list) {
      const ids = c.folderIds ?? [];
      if (ids.length === 0) unclassified++;
      for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
    }
    return { counts, unclassified, total: list.length };
  }, [tenantConversations]);

  // Si la carpeta seleccionada deja de estar disponible, volver a "Todas".
  useEffect(() => {
    if (selectedFolder === null || selectedFolder === UNCLASSIFIED) return;
    // Esperar a que carguen las carpetas; no resetear en estados intermedios.
    if (folders === undefined) return;
    if (!accessibleFolders.some((f) => f._id === selectedFolder)) {
      setSelectedFolder(null);
    }
  }, [selectedFolder, accessibleFolders, folders]);

  const filteredConversations = useMemo(() => {
    let list = folderScopedConversations;
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
  }, [folderScopedConversations, filterMode, searchQuery]);

  const handleListScroll = () => {
    const el = listScrollRef.current;
    if (!el || conversationsStatus !== "CanLoadMore" || loadingMoreRef.current)
      return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (!nearBottom) return;
    loadingMoreRef.current = true;
    loadMoreConversations(PAGE_SIZE);
    requestAnimationFrame(() => {
      loadingMoreRef.current = false;
    });
  };

  const handleLoadOlderMessages = () => {
    if (!hasMoreOlder || loadingOlder || !activeMessages.length) return;
    const oldest = activeMessages[0]?.createdAt;
    if (oldest == null) return;
    setLoadingOlder(true);
    setOlderCursor(oldest);
  };

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
      const active = tenantConversations.find((c) => c._id === selectedConversationId);
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
    setContextMenu(null);
    try {
      await updatePriority({ conversationId: targetId, priority: p });
    } catch (e) {
      sileo.error({
        title: "No se pudo cambiar la prioridad",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  };

  const handleSetStatus = async (
    status: "open" | "closed" | "pending"
  ) => {
    const targetId = contextMenu?.conversationId ?? selectedConversationId;
    if (!targetId) return;
    setContextMenu(null);
    try {
      await updateStatus({ conversationId: targetId, status });
      if (status === "closed") {
        sileo.success({ title: "Conversación resuelta" });
      } else if (status === "open") {
        sileo.success({ title: "Conversación reabierta" });
      }
    } catch (e) {
      sileo.error({
        title: "No se pudo actualizar el estado",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  };

  const handleToggleFolder = async (
    conversationId: Id<"conversations">,
    folderId: Id<"conversationFolders">,
    present: boolean
  ) => {
    try {
      await toggleConversationFolder({ conversationId, folderId, present });
    } catch (e) {
      sileo.error({
        title: "No se pudo mover",
        description: e instanceof Error ? e.message : "Error al mover el chat",
      });
    }
  };

  const handleContextMenuSetMode = async (userId: Id<"users"> | null) => {
    const targetId = contextMenu?.conversationId;
    if (!targetId) return;
    setContextMenu(null);
    try {
      await updateAssignedTo({ conversationId: targetId, userId });
      if (userId === null) {
        await updateStatus({ conversationId: targetId, status: "open" });
      }
    } catch (e) {
      sileo.error({
        title: "No se pudo cambiar el modo",
        description: e instanceof Error ? e.message : "Error desconocido",
      });
    }
  };

  const messageGroups = useMemo(() => {
    if (!activeMessages.length) return [];
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
    () => activeMessages.filter((m) => m.mediaUrl),
    [activeMessages]
  );

  const chatImages: ChatImageItem[] = useMemo(
    () =>
      activeMessages
        .filter((m) => m.mediaType === "image" && m.mediaUrl)
        .map((m) => ({ url: m.mediaUrl!, text: m.content || "" })),
    [activeMessages]
  );

  const handleSendImages = async (items: { file: File; caption: string }[]) => {
    if (!tenantId || !selectedConversationId || !user) return;
    setSending(true);
    setSendError(null);
    try {
      const active = tenantConversations.find((c) => c._id === selectedConversationId);
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
      const active = tenantConversations.find((c) => c._id === selectedConversationId);
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
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }
  if (ycloud === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }
  if (!ycloud?.connected) {
    return (
      <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-2xl" style={cssVars}>
          <IntegrationBlockedBanner
            message="Necesitas conectar WhatsApp o YCloud para usar el Inbox."
            integrationName="WhatsApp (YCloud)"
            primaryColor={primaryColor}
          />
          <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Una vez conectes YCloud en Integraciones, podrás recibir y enviar
              mensajes desde el Inbox.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const listPanel = (
    <>
      <ConversationsListHeader
        filterMode={filterMode}
        onFilterChange={setFilterMode}
        counts={counts}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      {(canManageFolders || accessibleFolders.length > 0) && (
        <FoldersRail
          folders={accessibleFolders}
          counts={folderCounts.counts}
          totalCount={folderCounts.total}
          unclassifiedCount={folderCounts.unclassified}
          showUnclassified={showUnclassified}
          selected={selectedFolder}
          onSelect={setSelectedFolder}
          canManage={canManageFolders}
          onManage={() => setFolderManagerOpen(true)}
        />
      )}
      <div
        ref={listScrollRef}
        onScroll={handleListScroll}
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto py-1.5"
      >
        {conversationsLoading ? (
          <ConversationsListSkeleton />
        ) : filteredConversations.length === 0 ? (
          <ConversationsListEmpty />
        ) : (
          <>
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
              <ConversationListItem
                key={conv._id}
                conv={conv}
                isActive={isActive}
                isNew={!!isNew}
                isBot={bot}
                onSelect={() => {
                  setSelectedConversationId(conv._id);
                  setSidebarOpen(false);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    conversationId: conv._id,
                  });
                }}
              />
            );
          })}
            {canLoadMoreConversations && (
              <p className="py-3 text-center text-[11px] text-muted-foreground">
                {conversationsStatus === "LoadingMore"
                  ? "Cargando más…"
                  : "Desplázate para cargar más"}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );

  const chatPanel = (
    <>
      {activeConversation ? (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <ConversationHeader
              customerName={activeConversation.customerName}
              status={activeConversation.status}
              isBot={isBotMode(activeConversation)}
              isPending={activeConversation.status === "pending"}
              phone={conversationPhone}
              priority={
                hasPriority(activeConversation.priority)
                  ? activeConversation.priority
                  : null
              }
              retryingBot={retryingBot}
              showRetryBot={
                isBotMode(activeConversation) &&
                activeConversation.status !== "closed" &&
                activeConversation.channel === "whatsapp"
              }
              showContactInfo={showContactInfo}
              onBack={() => setSidebarOpen(true)}
              onToggleMode={() =>
                isBotMode(activeConversation)
                  ? handleSetMode(getHumanUserId())
                  : handleSetMode(null)
              }
              canTakeControl={Boolean(getHumanUserId())}
              onRetryBot={handleRetryBot}
              onResolve={() => handleSetStatus("closed")}
              onReopen={() => handleSetStatus("open")}
              onSetPriority={handleSetPriority}
              onToggleContactInfo={() => setShowContactInfo((x) => !x)}
            />

            <div
              ref={messagesScrollRef}
              className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
            >
              {hasMoreOlder && (
                <div className="mb-4 flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadOlderMessages}
                    disabled={loadingOlder}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-60"
                  >
                    {loadingOlder
                      ? "Cargando…"
                      : "Cargar mensajes anteriores"}
                  </button>
                </div>
              )}
              {messageGroups.map(({ date, messages }) => (
                <div key={date} className="mb-5">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {date}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="space-y-2.5">
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
                              "max-w-[80%] px-3 py-2 text-[14.2px] leading-snug",
                              isOutbound ? inbox.bubbleOut : inbox.bubbleIn
                            )}
                          >
                            {msg.mediaUrl && (
                              <div className="mb-2 overflow-hidden rounded-lg">
                                <MessageMedia
                                  mediaUrl={msg.mediaUrl}
                                  mediaType={msg.mediaType}
                                  content={msg.content}
                                  isInbound={msg.direction === "INBOUND"}
                                  avatarSeed={
                                    msg.direction === "INBOUND"
                                      ? activeConversation.customerName
                                      : "Agente"
                                  }
                                  createdAt={msg.createdAt}
                                  onOpenImage={
                                    msg.mediaType === "image" ||
                                    (!msg.mediaType && !!msg.mediaUrl)
                                      ? () => {
                                          const idx = chatImages.findIndex(
                                            (img) => img.url === msg.mediaUrl
                                          );
                                          setViewerInitialIndex(
                                            idx !== -1 ? idx : 0
                                          );
                                        }
                                      : undefined
                                  }
                                />
                              </div>
                            )}
                            {(!msg.mediaUrl ||
                              (msg.content &&
                                ![
                                  "Imagen",
                                  "Video",
                                  "Audio",
                                  "Sticker",
                                  "Documento",
                                ].includes(msg.content) &&
                                msg.mediaType !== "document")) && (
                              <p className="whitespace-pre-wrap wrap-break-word">
                                {msg.content}
                              </p>
                            )}
                            <p className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                              {isOutbound && msg.isBot && (
                                <span className="mr-1 font-semibold text-emerald-600 dark:text-emerald-400">
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
              {activeMessages.length === 0 && recentMessagesPage !== undefined && (
                <div className="flex h-40 items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    No hay mensajes aún
                  </p>
                </div>
              )}
            </div>

            <ConversationComposer
              replyText={replyText}
              onReplyChange={setReplyText}
              onSend={handleSendMessage}
              sending={sending}
              sendError={sendError}
              pendingAttachments={pendingAttachments}
              onRemoveAttachment={handleRemoveAttachment}
              isRecording={isRecording}
              onToggleRecording={() =>
                isRecording ? handleStopRecording() : handleStartRecording()
              }
              onImprove={handleImproveText}
              improving={improving}
              fileInputRef={fileInputRef}
              imageInputRef={imageInputRef}
              documentInputRef={documentInputRef}
              onFileSelect={handleFileSelect}
              onImageChange={handleImageChange}
              onDocumentChange={handleDocumentChange}
            />
          </div>

          {showContactInfo && (
            <aside
              className={cn(
                "flex w-72 shrink-0 flex-col overflow-hidden border-l",
                inbox.border,
                inbox.panel
              )}
            >
              <div className={cn("shrink-0 p-4", inbox.header)}>
                <h3 className="text-sm font-semibold text-foreground">
                  Información de contacto
                </h3>
                <div className="mt-3 space-y-2 text-sm">
                  <p>
                    <span className="text-muted-foreground">Nombre: </span>
                    <span className="font-medium text-foreground">
                      {activeConversation.customerName}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Canal: </span>
                    <span className="font-medium text-foreground">
                      {activeConversation.channel}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Contacto: </span>
                    <span className="font-medium text-foreground">
                      {conversationPhone}
                    </span>
                  </p>
                  {hasPriority(activeConversation.priority) && (
                    <p>
                      <span className="text-muted-foreground">Prioridad: </span>
                      <span className="font-medium text-foreground">
                        {PRIORITY_LABELS[activeConversation.priority]}
                      </span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Imágenes y videos
                </h4>
                {mediaMessages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No hay archivos en esta conversación
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {mediaMessages.map((m) =>
                      m.mediaUrl ? (
                        <div
                          key={m._id}
                          className="overflow-hidden rounded-lg border border-border bg-card"
                        >
                          {m.mediaType === "video" ? (
                            <video
                              src={m.mediaUrl}
                              className="aspect-square w-full object-cover"
                            />
                          ) : m.mediaType === "document" ? (
                            <a
                              href={m.mediaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group flex aspect-square flex-col items-center justify-center p-3 hover:bg-muted/50"
                            >
                              <div
                                className="grid size-10 place-items-center rounded text-xs font-bold text-white"
                                style={{
                                  backgroundColor: "var(--primaryColor)",
                                }}
                              >
                                PDF
                              </div>
                              <span className="mt-2 max-w-full truncate text-[10px] text-muted-foreground">
                                {m.content || "Documento"}
                              </span>
                            </a>
                          ) : (
                            <a
                              href={m.mediaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <img
                                src={m.mediaUrl}
                                alt=""
                                className="aspect-square w-full object-cover hover:opacity-95"
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
            className="mb-4 grid size-14 place-items-center rounded-2xl"
            style={{ background: "var(--primarySoft)" }}
          >
            <MessageSquare
              size={28}
              strokeWidth={1.5}
              style={{ color: "var(--primaryColor)" }}
            />
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Bandeja de mensajes
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Elige una conversación de la lista para empezar a chatear con tus
            clientes.
          </p>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="mt-4 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/80 md:hidden"
          >
            Ver conversaciones
          </button>
        </div>
      )}

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

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-100 flex w-56 max-h-[min(70vh,420px)] flex-col overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Acciones rápidas
            </div>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void handleSetStatus("closed")}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            >
              <CheckCircle2
                size={14}
                className="text-(--primaryColor)"
                strokeWidth={1.8}
              />
              Marcar como resuelta
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void handleSetStatus("open")}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            >
              Reabrir conversación
            </button>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void handleContextMenuSetMode(null)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            >
              <Bot size={14} strokeWidth={1.8} />
              Cambiar a Bot
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void handleContextMenuSetMode(getHumanUserId())}
              disabled={!getHumanUserId()}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <UserRound size={14} strokeWidth={1.8} />
              Cambiar a humano
            </button>
            <div className="my-1 h-px bg-border" />
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Prioridad
            </div>
            {(["low", "normal", "high", "urgent"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => void handleSetPriority(p)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: PRIORITY_DOT[p] }}
                />
                {PRIORITY_LABELS[p]}
              </button>
            ))}
            {(folders?.length ?? 0) > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Carpetas
                </div>
                {(() => {
                  const target = tenantConversations.find(
                    (c) => c._id === contextMenu.conversationId
                  );
                  const current = new Set(target?.folderIds ?? []);
                  return (folders ?? []).map((f) => {
                    const FolderIcon = folderIcon(f.icon);
                    const isIn = current.has(f._id);
                    return (
                      <button
                        key={f._id}
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() =>
                          void handleToggleFolder(
                            contextMenu.conversationId,
                            f._id,
                            !isIn
                          )
                        }
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                      >
                        <FolderIcon
                          size={14}
                          style={{ color: f.color ?? "#64748b" }}
                        />
                        <span className="flex-1 truncate">{f.name}</span>
                        {isIn && (
                          <Check
                            size={14}
                            className="shrink-0 text-(--primaryColor)"
                          />
                        )}
                      </button>
                    );
                  });
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden" style={cssVars}>
      <ConversationsLayout
        showChatOnMobile={Boolean(selectedConversationId) && !sidebarOpen}
        list={listPanel}
        chat={chatPanel}
      />
      {folderManagerOpen && (
        <FolderManagerModal
          open={folderManagerOpen}
          onOpenChange={setFolderManagerOpen}
          tenantId={tenantId}
          folders={folders ?? []}
          primaryColor={primaryColor}
        />
      )}
    </div>
  );
}
