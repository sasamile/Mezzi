"use client";

import { resolvePrimaryColor } from "@/lib/tenant-theme";

import { useQuery, useMutation } from "convex/react";
import { useRequireModule } from "@/lib/use-require-module";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  BookOpen,
  CloudUpload,
  Database,
  Pencil,
  Trash2,
  FileText,
  FileUp,
  Zap,
  MessageCircle,
  Loader2,
  X,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const DEFAULT_SECONDARY = "#06b6d4";

const ACCEPTED_TYPES =
  ".txt,.md,.csv,.json,.pdf,.doc,.docx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";

const FILE_TYPES = [".txt", ".md", ".csv", ".json", ".pdf", ".doc", ".docx"];
const INTRO_SEEN_KEY = "knowledge-intro-seen";

export default function KnowledgePage() {
  useRequireModule("conocimiento");
  const { tenantId } = useTenant();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [editingId, setEditingId] = useState<Id<"knowledgeItems"> | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showIntroModal, setShowIntroModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tenantId || typeof window === "undefined") return;
    const key = `${INTRO_SEEN_KEY}-${tenantId}`;
    const seen = localStorage.getItem(key);
    if (!seen) {
      setShowIntroModal(true);
    }
  }, [tenantId]);

  const closeIntroModal = useCallback(
    (dontShowAgain?: boolean) => {
      if (tenantId && typeof window !== "undefined" && dontShowAgain) {
        localStorage.setItem(`${INTRO_SEEN_KEY}-${tenantId}`, "1");
      }
      setShowIntroModal(false);
    },
    [tenantId]
  );

  const tenant = useQuery(
    api.tenants.get,
    tenantId ? { tenantId } : "skip"
  );
  const items = useQuery(
    api.knowledge.listByTenant,
    tenantId ? { tenantId } : "skip"
  );

  const createItem = useMutation(api.knowledge.create);
  const createFromFile = useMutation(api.knowledge.createFromFile);
  const updateItem = useMutation(api.knowledge.update);
  const removeItem = useMutation(api.knowledge.remove);
  const generateUploadUrl = useMutation(api.knowledge.generateUploadUrl);

  const primaryColor = resolvePrimaryColor(tenant?.primaryColor);
  const secondaryColor = tenant?.secondaryColor ?? DEFAULT_SECONDARY;

  const cssVars = useMemo(
    () =>
      ({
        "--primaryColor": primaryColor,
        "--primarySoft": `color-mix(in srgb, ${primaryColor} 12%, white)`,
        "--secondaryColor": secondaryColor,
      } as React.CSSProperties),
    [primaryColor, secondaryColor]
  );

  const editingItem = items?.find((i) => i._id === editingId);
  const isFileItem = editingItem?.storageId != null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    if (!trimmedTitle) return;

    setSubmitLoading(true);
    try {
      if (editingId) {
        await updateItem({
          id: editingId,
          title: trimmedTitle,
          ...(isFileItem ? {} : { content: trimmedContent }),
          tags: tagsInput.trim() ? tagsInput.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        });
        setEditingId(null);
      } else {
        await createItem({
          tenantId,
          title: trimmedTitle,
          content: trimmedContent,
          tags: tagsInput.trim() ? tagsInput.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        });
      }
      setTitle("");
      setContent("");
      setTagsInput("");
    } finally {
      setSubmitLoading(false);
    }
  };

  const processFile = useCallback(
    async (file: File) => {
      if (!tenantId) return;
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const allowed = ["txt", "md", "csv", "json", "pdf", "doc", "docx"];
      if (!allowed.includes(ext)) {
        alert("Solo se permiten archivos .txt, .md, .csv, .json, .pdf o .doc/.docx");
        return;
      }

      setUploading(true);
      setUploadProgress(0);
      const progressInterval = setInterval(() => {
        setUploadProgress((p) => (p >= 90 ? p : p + 15));
      }, 200);

      try {
        const url = await generateUploadUrl();
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error("Error al subir");

        const { storageId } = await res.json();
        await createFromFile({
          tenantId,
          storageId,
          title: file.name.replace(/\.[^.]+$/, "") || file.name,
        });
        setUploadProgress(100);
      } catch (err) {
        console.error(err);
        alert("Error al subir el archivo");
      } finally {
        clearInterval(progressInterval);
        setUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [tenantId, generateUploadUrl, createFromFile]
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleEdit = (item: {
    _id: Id<"knowledgeItems">;
    title: string;
    content: string;
    storageId?: unknown;
    tags?: string[];
  }) => {
    setEditingId(item._id);
    setTitle(item.title);
    setContent(item.storageId ? "" : item.content);
    setTagsInput(item.tags?.join(", ") ?? "");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setTitle("");
    setContent("");
    setTagsInput("");
  };

  const handleDelete = async (id: Id<"knowledgeItems">) => {
    if (!confirm("¿Eliminar este ítem del conocimiento?")) return;
    await removeItem({ id });
    if (editingId === id) handleCancelEdit();
  };

  if (!tenantId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="min-h-full w-full pb-8"
      style={{ ...cssVars, backgroundColor: "#F8FAFC" }}
    >
      <div className="w-full h-full ">
      <div className="rounded-2xl border border-border/60 bg-card  shadow-lg h-screen overflow-y-auto">

        {/* Contenedor padre: card blanca que envuelve todo el Centro de Conocimiento */}
          <div className="p-6 sm:p-8">
            {/* Header */}
        <header className="pt-8 pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Centro de Conocimiento
              </h1>
              <p className="mt-1 text-sm text-muted-foreground max-w-xl">
                Aquí puedes cargar la información que el bot utilizará para
                responder automáticamente en WhatsApp.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowIntroModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium border border-border hover:bg-muted/50 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                ¿Cómo funciona?
              </button>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium w-fit"
                style={{
                  backgroundColor: "var(--primarySoft)",
                  color: "var(--primaryColor)",
                }}
              >
                <Zap className="h-3.5 w-3.5" />
                RAG Activo
              </span>
            </div>
          </div>
        </header>

        {/* Modal ¿Cómo funciona? - primera vez o al hacer clic */}
        <Dialog open={showIntroModal} onOpenChange={(open) => !open && closeIntroModal()}>
          <DialogContent className="max-w-md" style={{ ...cssVars } as React.CSSProperties}>
            <DialogHeader>
              <DialogTitle>¿Cómo funciona?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 size-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--primarySoft)", color: "var(--primaryColor)" }}
                >
                  <FileUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">1. Carga contenido</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Añade artículos manuales o sube archivos (.txt, .md, .pdf, etc.)
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 size-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--primarySoft)", color: "var(--primaryColor)" }}
                >
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">2. Se indexa automáticamente</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    RAG procesa y estructura tu información para búsquedas inteligentes
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div
                  className="shrink-0 size-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--primarySoft)", color: "var(--primaryColor)" }}
                >
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">3. El bot lo usa para responder</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Las conversaciones en WhatsApp se nutren de este conocimiento
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => closeIntroModal(true)}
                className="w-full sm:w-auto rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: primaryColor }}
              >
                Entendido
              </button>
              <button
                type="button"
                onClick={() => closeIntroModal()}
                className="w-full sm:w-auto rounded-lg px-4 py-2 text-sm font-medium border border-input hover:bg-muted transition-colors"
              >
                Cerrar
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ¿Cómo funciona? */}
        <section className="mb-8 rounded-xl border border-border/60 bg-card p-4 sm:p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            ¿Cómo funciona?
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div
                className="shrink-0 size-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "var(--primarySoft)", color: "var(--primaryColor)" }}
              >
                <FileUp className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">1. Carga contenido</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Añade artículos manuales o sube archivos (.txt, .md, .pdf, etc.)
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div
                className="shrink-0 size-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "var(--primarySoft)", color: "var(--primaryColor)" }}
              >
                <Database className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">2. Se indexa automáticamente</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  RAG procesa y estructura tu información para búsquedas inteligentes
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div
                className="shrink-0 size-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "var(--primarySoft)", color: "var(--primaryColor)" }}
              >
                <MessageCircle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">3. El bot lo usa para responder</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Las conversaciones en WhatsApp se nutren de este conocimiento
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),minmax(0,1.2fr)]">
          {/* Columna izquierda: Crear artículo + Subir archivo */}
          <div className="space-y-6">
            {/* Crear artículo */}
            <section className="rounded-xl border border-border/60 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="size-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--primarySoft)", color: "var(--primaryColor)" }}
                >
                  <BookOpen className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-foreground">
                  {editingId ? "Editar artículo" : "Crear artículo"}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ej: Menú del día, Horarios de atención, Política de reservas"
                      className="w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-offset-1"
                      style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Un título claro ayuda al bot a encontrar la información correcta.
                  </p>
                </div>

                <div>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={
                      isFileItem
                        ? "Los archivos subidos extraen el contenido automáticamente."
                        : "Escribe aquí el contenido: menús, horarios, políticas, FAQs..."
                    }
                    disabled={isFileItem}
                    rows={4}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed resize-none"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isFileItem ? "El contenido proviene del archivo adjunto." : "Incluye toda la información relevante para que el bot la use en sus respuestas."}
                  </p>
                </div>

                <div>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="menu, horarios, reservas (opcional, separados por coma)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-offset-1"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Etiquetas ayudan a organizar y filtrar el conocimiento.
                  </p>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={!title.trim() || submitLoading}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {submitLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : editingId ? (
                      "Guardar cambios"
                    ) : (
                      "Añadir artículo"
                    )}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      <X className="h-4 w-4" />
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            {/* Subir archivo */}
            <section className="rounded-xl border border-border/60 bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="size-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "var(--primarySoft)", color: "var(--primaryColor)" }}
                >
                  <CloudUpload className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-foreground">
                  Subir archivo
                </h2>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={cn(
                  "relative rounded-xl border-2 border-dashed transition-all cursor-pointer min-h-[140px] flex flex-col items-center justify-center gap-3 p-6",
                  isDragOver
                    ? "border-(--primaryColor) bg-(--primarySoft)/30"
                    : "border-muted-foreground/25 bg-muted/30 hover:bg-muted/50 hover:border-muted-foreground/40",
                  uploading && "pointer-events-none opacity-90"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
                {uploading ? (
                  <>
                    <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">
                      Subiendo e indexando…
                    </p>
                    <div className="w-full max-w-xs h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${uploadProgress}%`,
                          backgroundColor: primaryColor,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <CloudUpload
                      className="h-10 w-10 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    <p className="text-sm font-medium text-foreground text-center">
                      Arrastra tus archivos aquí o haz clic para subirlos
                    </p>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {FILE_TYPES.map((ext) => (
                        <span
                          key={ext}
                          className="rounded-md px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
                        >
                          {ext}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Columna derecha: Conocimiento indexado */}
          <section className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div
                className="size-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "var(--primarySoft)", color: "var(--primaryColor)" }}
              >
                <Database className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                Conocimiento indexado
              </h2>
              {items && items.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {items.length} {items.length === 1 ? "ítem" : "ítems"}
                </span>
              )}
            </div>

            {items && items.length > 0 ? (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item._id}
                    className="group rounded-lg border border-border/60 bg-background p-4 transition-all hover:shadow-md hover:border-border"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">
                          {item.title}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                              item.storageId
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-blue-100 text-blue-700"
                            )}
                          >
                            {item.storageId ? (
                              <>
                                <FileUp className="h-2.5 w-2.5" />
                                Archivo
                              </>
                            ) : (
                              <>
                                <FileText className="h-2.5 w-2.5" />
                                Artículo
                              </>
                            )}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                              item.ragEntryId
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            )}
                          >
                            {item.ragEntryId ? (
                              <>
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                Indexado
                              </>
                            ) : (
                              <>
                                <Clock className="h-2.5 w-2.5" />
                                Procesando
                              </>
                            )}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(item.updatedAt).toLocaleDateString("es-ES", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleEdit(item)}
                          className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item._id)}
                          className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-12 px-4 rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/20">
                <div
                  className="size-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: "var(--primarySoft)", color: "var(--primaryColor)" }}
                >
                  <Database className="h-8 w-8" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  Aún no hay conocimiento cargado
                </h3>
                <p className="text-xs text-muted-foreground text-center max-w-[220px]">
                  Crea tu primer artículo o sube un archivo para que el bot
                  empiece a responder con tu información.
                </p>
              </div>
            )}
          </section>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}
