"use client";

import { resolvePrimaryColor } from "@/lib/tenant-theme";
import * as React from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useRequireModule } from "@/lib/use-require-module";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import {
  Plus,
  Search,
  MessageSquare,
  AlertCircle,
  FileWarning,
  Lightbulb,
  Star,
  Mail,
  Loader2,
  Paperclip,
  ImagePlus,
  X,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageHeader, PageSurface } from "@/components/layout/page-chrome";
import { sileo } from "@/lib/toast";

type PqrType = "petition" | "complaint" | "claim" | "suggestion" | "compliment";
type PqrStatus = "open" | "in_progress" | "resolved" | "closed";

const TYPE_LABELS: Record<PqrType, string> = {
  petition: "Petición",
  complaint: "Queja",
  claim: "Reclamo",
  suggestion: "Sugerencia",
  compliment: "Felicitación",
};

const STATUS_LABELS: Record<PqrStatus, string> = {
  open: "Abierto",
  in_progress: "En proceso",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const TYPE_ICONS: Record<PqrType, React.ElementType> = {
  petition: MessageSquare,
  complaint: AlertCircle,
  claim: FileWarning,
  suggestion: Lightbulb,
  compliment: Star,
};

const fieldClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const textareaClass =
  "min-h-[96px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ACCEPTED =
  "image/png,image/jpeg,image/webp,image/heic,application/pdf";

type PendingFile = {
  storageId: Id<"_storage">;
  mediaType: "image" | "document";
  fileName: string;
  previewUrl?: string;
};

export default function PQRsPage() {
  useRequireModule("pqr");
  const { tenantId } = useTenant();
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<Id<"pqrs"> | null>(null);
  const [deleteId, setDeleteId] = React.useState<Id<"pqrs"> | null>(null);
  const [form, setForm] = React.useState({
    type: "petition" as PqrType,
    anonymous: false,
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    subject: "",
    description: "",
  });
  const [pendingFiles, setPendingFiles] = React.useState<PendingFile[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [resolutionNotes, setResolutionNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [resendMessage, setResendMessage] = React.useState<string | null>(null);

  const tenant = useQuery(api.tenants.get, tenantId ? { tenantId } : "skip");
  const pqrs = useQuery(
    api.pqrs.list,
    tenantId
      ? {
          tenantId,
          status: statusFilter !== "all" ? statusFilter : undefined,
          type: typeFilter !== "all" ? typeFilter : undefined,
        }
      : "skip"
  );
  const createPqr = useMutation(api.pqrs.create);
  const updatePqr = useMutation(api.pqrs.update);
  const removePqr = useMutation(api.pqrs.remove);
  const generateUploadUrl = useMutation(api.pqrs.generateAttachmentUploadUrl);
  const resendNotificationEmail = useAction(api.pqrs.resendNotificationEmail);
  const detailPqr = detailId ? pqrs?.find((p) => p._id === detailId) : null;

  const primaryColor = resolvePrimaryColor(tenant?.primaryColor);

  const filtered = React.useMemo(() => {
    const list = pqrs ?? [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (p) =>
        p.customerName.toLowerCase().includes(q) ||
        p.subject.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }, [pqrs, searchQuery]);

  const resetForm = () => {
    setForm({
      type: "petition",
      anonymous: false,
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      subject: "",
      description: "",
    });
    setPendingFiles([]);
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (pendingFiles.length + files.length > 5) {
      sileo.error({
        title: "Límite de archivos",
        description: "Puedes adjuntar hasta 5 archivos.",
      });
      return;
    }

    setUploading(true);
    try {
      const next: PendingFile[] = [];
      for (const file of files) {
        const isPdf = file.type === "application/pdf";
        const isImage = file.type.startsWith("image/");
        if (!isPdf && !isImage) {
          sileo.error({
            title: "Formato no válido",
            description: `${file.name}: usa imagen o PDF.`,
          });
          continue;
        }
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) throw new Error(`No se pudo subir ${file.name}`);
        const { storageId } = (await res.json()) as {
          storageId: Id<"_storage">;
        };
        next.push({
          storageId,
          mediaType: isPdf ? "document" : "image",
          fileName: file.name,
          previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        });
      }
      setPendingFiles((prev) => [...prev, ...next]);
    } catch (err) {
      sileo.error({
        title: "Error al subir",
        description:
          err instanceof Error ? err.message : "No se pudieron subir los archivos.",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    if (!form.subject.trim() || !form.description.trim()) return;
    if (!form.anonymous && !form.customerName.trim()) return;
    setSaving(true);
    try {
      await createPqr({
        tenantId,
        type: form.type,
        customerName: form.anonymous
          ? undefined
          : form.customerName.trim() || undefined,
        customerEmail: form.customerEmail.trim() || undefined,
        customerPhone: form.customerPhone.trim() || undefined,
        subject: form.subject.trim(),
        description: form.description.trim(),
        source: "web",
        uploadedAttachments:
          pendingFiles.length > 0
            ? pendingFiles.map((f) => ({
                storageId: f.storageId,
                mediaType: f.mediaType,
                fileName: f.fileName,
              }))
            : undefined,
      });
      setCreateOpen(false);
      resetForm();
      sileo.success({
        title: "PQR registrada",
        description: "Se notificará por correo al área correspondiente.",
      });
    } catch (err) {
      sileo.error({
        title: "Error al crear",
        description:
          err instanceof Error ? err.message : "No se pudo crear la PQR.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (pqrId: Id<"pqrs">, status: PqrStatus) => {
    try {
      await updatePqr({ pqrId, status });
      if (status === "resolved" || status === "closed") setDetailId(null);
      sileo.success({
        title: "Estado actualizado",
        description: `PQR marcada como ${STATUS_LABELS[status].toLowerCase()}.`,
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description:
          err instanceof Error ? err.message : "No se pudo actualizar.",
      });
    }
  };

  const handleResolve = async () => {
    if (!detailId) return;
    setSaving(true);
    try {
      await updatePqr({
        pqrId: detailId,
        status: "resolved",
        resolutionNotes: resolutionNotes.trim() || undefined,
      });
      setDetailId(null);
      setResolutionNotes("");
      sileo.success({
        title: "PQR resuelta",
        description: "El caso quedó marcado como resuelto.",
      });
    } catch (err) {
      sileo.error({
        title: "Error",
        description:
          err instanceof Error ? err.message : "No se pudo resolver.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await removePqr({ pqrId: deleteId });
      setDeleteId(null);
      setDetailId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  const handleResendEmail = async () => {
    if (!detailId) return;
    setResending(true);
    setResendMessage(null);
    try {
      const result = await resendNotificationEmail({ pqrId: detailId });
      if (result.ok) {
        setResendMessage(
          `Correo reenviado a ${result.to.join(", ")}${result.cc.length ? ` (CC: ${result.cc.join(", ")})` : ""}`
        );
        sileo.success({ title: "Correo reenviado" });
      } else {
        setResendMessage(result.error);
        sileo.error({ title: "No se pudo reenviar", description: result.error });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al reenviar";
      setResendMessage(msg);
      sileo.error({ title: "Error", description: msg });
    } finally {
      setResending(false);
    }
  };

  return (
    <PageSurface className="bg-muted/30">
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader
          title="PQRs"
          description="Peticiones, quejas y reclamos de clientes."
          actions={
            <button
              type="button"
              onClick={() => {
                resetForm();
                setCreateOpen(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus size={16} strokeWidth={2} />
              Nuevo PQR
            </button>
          }
        />

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.7}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cliente o asunto…"
              className={cn(fieldClass, "pl-9")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={cn(fieldClass, "w-auto")}
            >
              <option value="all">Todos los tipos</option>
              {(["petition", "complaint", "claim"] as const).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={cn(fieldClass, "w-auto")}
            >
              <option value="all">Todos los estados</option>
              {(
                ["open", "in_progress", "resolved", "closed"] as const
              ).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Lista de PQRs
            </h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtered.length} registro{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="divide-y divide-border">
            {pqrs === undefined ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Cargando…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                <MessageSquare
                  className="size-10 text-muted-foreground/50"
                  strokeWidth={1.5}
                />
                <p className="text-sm font-medium text-foreground">
                  No hay PQRs
                </p>
                <p className="text-sm text-muted-foreground">
                  Registra peticiones, quejas o reclamos de tus clientes.
                </p>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Plus size={14} /> Nuevo PQR
                </button>
              </div>
            ) : (
              filtered.map((p) => {
                const Icon = TYPE_ICONS[p.type];
                const hasFiles = (p.attachments?.length ?? 0) > 0;
                return (
                  <div
                    key={p._id}
                    className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => setDetailId(p._id)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon
                          className="size-4 text-muted-foreground"
                          strokeWidth={1.7}
                        />
                        <span className="text-sm font-semibold text-foreground">
                          {p.customerName}
                        </span>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[11px] font-medium",
                            p.type === "petition" &&
                              "bg-sky-500/15 text-sky-700 dark:text-sky-300",
                            p.type === "complaint" &&
                              "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                            p.type === "claim" &&
                              "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                            p.type === "suggestion" &&
                              "bg-violet-500/15 text-violet-700 dark:text-violet-300",
                            p.type === "compliment" &&
                              "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          )}
                        >
                          {TYPE_LABELS[p.type]}
                        </span>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {STATUS_LABELS[p.status]}
                        </span>
                        {hasFiles && (
                          <span
                            className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                            title="Con adjuntos"
                          >
                            <Paperclip size={11} strokeWidth={2} />
                            {p.attachments!.length}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {p.subject}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                        {p.description}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailId(p._id)}
                        className="h-8 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        Ver detalle
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(p._id)}
                        className="h-8 rounded-lg border border-destructive/25 bg-destructive/5 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Modal crear */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo PQR</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Puedes adjuntar una foto o PDF de forma opcional.
            </p>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Tipo *
                </label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      type: e.target.value as PqrType,
                    }))
                  }
                  className={fieldClass}
                >
                  {(["petition", "complaint", "claim"] as const).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.anonymous}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, anonymous: e.target.checked }))
                  }
                  className="size-4 rounded border-border"
                />
                PQR anónima
              </label>
            </div>

            {!form.anonymous && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">
                    Nombre del cliente *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.customerName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, customerName: e.target.value }))
                    }
                    placeholder="Ej. Juan Pérez"
                    className={fieldClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Email
                    </label>
                    <input
                      type="email"
                      value={form.customerEmail}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          customerEmail: e.target.value,
                        }))
                      }
                      placeholder="cliente@email.com"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Teléfono
                    </label>
                    <input
                      type="tel"
                      value={form.customerPhone}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          customerPhone: e.target.value,
                        }))
                      }
                      placeholder="+57 300…"
                      className={fieldClass}
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Asunto *
              </label>
              <input
                type="text"
                required
                value={form.subject}
                onChange={(e) =>
                  setForm((f) => ({ ...f, subject: e.target.value }))
                }
                placeholder="Resumen del PQR"
                className={fieldClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Descripción *
              </label>
              <textarea
                required
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Detalle de la petición, queja o reclamo…"
                rows={4}
                className={textareaClass}
              />
            </div>

            {/* Adjuntos opcionales */}
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Evidencia (opcional)
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Foto de factura, RUT u otro PDF. Hasta 5 archivos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || pendingFiles.length >= 5}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ImagePlus size={14} strokeWidth={1.7} />
                  )}
                  {uploading ? "Subiendo…" : "Adjuntar"}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                multiple
                className="sr-only"
                onChange={handleFilePick}
              />
              {pendingFiles.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {pendingFiles.map((f) => (
                    <li
                      key={f.storageId}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2"
                    >
                      {f.previewUrl ? (
                        <img
                          src={f.previewUrl}
                          alt=""
                          className="size-9 rounded-md object-cover"
                        />
                      ) : (
                        <span className="grid size-9 place-items-center rounded-md bg-muted text-muted-foreground">
                          <FileText size={16} strokeWidth={1.7} />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                        {f.fileName}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingFiles((prev) =>
                            prev.filter((x) => x.storageId !== f.storageId)
                          )
                        }
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Quitar archivo"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <DialogFooter className="gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || uploading}
                className="h-10 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? "Creando…" : "Crear PQR"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal detalle */}
      <Dialog
        open={!!detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del PQR</DialogTitle>
          </DialogHeader>
          {detailPqr && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <span
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium",
                    detailPqr.type === "petition" &&
                      "bg-sky-500/15 text-sky-700 dark:text-sky-300",
                    detailPqr.type === "complaint" &&
                      "bg-amber-500/15 text-amber-800 dark:text-amber-300",
                    detailPqr.type === "claim" &&
                      "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                  )}
                >
                  {TYPE_LABELS[detailPqr.type]}
                </span>
                <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {STATUS_LABELS[detailPqr.status]}
                </span>
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Cliente
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {detailPqr.customerName}
                </p>
                {detailPqr.customerEmail && (
                  <p className="text-sm text-muted-foreground">
                    {detailPqr.customerEmail}
                  </p>
                )}
                {detailPqr.customerPhone && (
                  <a
                    href={`tel:${detailPqr.customerPhone}`}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    {detailPqr.customerPhone}
                  </a>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Asunto
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {detailPqr.subject}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Descripción
                </p>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {detailPqr.description}
                </p>
              </div>

              {(detailPqr.attachments?.length ?? 0) > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Adjuntos
                  </p>
                  <ul className="space-y-2">
                    {detailPqr.attachments!.map((a, i) => (
                      <li key={`${a.url}-${i}`}>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                        >
                          {a.mediaType === "image" ? (
                            <img
                              src={a.url}
                              alt=""
                              className="size-10 rounded-md object-cover"
                            />
                          ) : (
                            <span className="grid size-10 place-items-center rounded-md bg-background text-muted-foreground">
                              <FileText size={16} />
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            {a.fileName ??
                              (a.mediaType === "image" ? "Imagen" : "Documento")}
                          </span>
                          <Paperclip
                            size={14}
                            className="shrink-0 text-muted-foreground"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detailPqr.resolutionNotes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Notas de resolución
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {detailPqr.resolutionNotes}
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="text-sm font-medium text-foreground">
                  Notificación por correo
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reenvía al área correspondiente. Incluye adjuntos si hay.
                </p>
                {resendMessage && (
                  <p
                    className={cn(
                      "mt-2 text-xs",
                      resendMessage.startsWith("Correo reenviado")
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive"
                    )}
                  >
                    {resendMessage}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleResendEmail}
                  disabled={resending}
                  className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {resending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Mail className="size-4" strokeWidth={1.7} />
                  )}
                  {resending ? "Reenviando…" : "Reenviar correo"}
                </button>
              </div>

              {(detailPqr.status === "open" ||
                detailPqr.status === "in_progress") && (
                <>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground">
                      Notas de resolución
                    </label>
                    <textarea
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      placeholder="Cómo se resolvió…"
                      rows={3}
                      className={textareaClass}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleStatusChange(detailPqr._id, "in_progress")
                      }
                      className="h-9 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
                    >
                      En proceso
                    </button>
                    <button
                      type="button"
                      onClick={handleResolve}
                      disabled={saving}
                      className="h-9 rounded-lg bg-emerald-600/15 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-600/25 disabled:opacity-50 dark:text-emerald-400"
                    >
                      Resolver
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleStatusChange(detailPqr._id, "closed")
                      }
                      className="h-9 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
                    >
                      Cerrar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar PQR?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El registro se eliminará
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageSurface>
  );
}
