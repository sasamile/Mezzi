"use client";

import * as React from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useRequireModule } from "@/lib/use-require-module";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { Plus, Search, MessageSquare, AlertCircle, FileWarning, Lightbulb, Star, Mail, Loader2 } from "lucide-react";
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

const DEFAULT_PRIMARY = "#197fe6";

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

export default function PQRsPage() {
  useRequireModule("pqr");
  const { tenantId } = useTenant();
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
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
  const resendNotificationEmail = useAction(api.pqrs.resendNotificationEmail);
  const detailPqr = detailId ? pqrs?.find((p) => p._id === detailId) : null;

  const primaryColor = tenant?.primaryColor ?? DEFAULT_PRIMARY;

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
        customerName: form.anonymous ? undefined : form.customerName.trim() || undefined,
        customerEmail: form.customerEmail.trim() || undefined,
        customerPhone: form.customerPhone.trim() || undefined,
        subject: form.subject.trim(),
        description: form.description.trim(),
        source: "web",
      });
      setCreateOpen(false);
      setForm({ type: "petition", anonymous: false, customerName: "", customerEmail: "", customerPhone: "", subject: "", description: "" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (pqrId: Id<"pqrs">, status: PqrStatus) => {
    try {
      await updatePqr({ pqrId, status });
      if (status === "resolved" || status === "closed") {
        setDetailId(null);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al actualizar");
    }
  };

  const handleResolve = async () => {
    if (!detailId) return;
    setSaving(true);
    try {
      await updatePqr({ pqrId: detailId, status: "resolved", resolutionNotes: resolutionNotes.trim() || undefined });
      setDetailId(null);
      setResolutionNotes("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al resolver");
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
        const ccNote =
          result.cc.length > 0 ? ` (con copia a ${result.cc.join(", ")})` : "";
        setResendMessage(`Correo reenviado a ${result.to.join(", ")}${ccNote}`);
      } else {
        setResendMessage(result.error ?? "No se pudo reenviar el correo");
      }
    } catch (err) {
      setResendMessage(err instanceof Error ? err.message : "Error al reenviar");
    } finally {
      setResending(false);
    }
  };

  React.useEffect(() => {
    if (!detailId) {
      setResendMessage(null);
    }
  }, [detailId]);

  if (!tenantId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-slate-500">Cargando…</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-full flex-col overflow-y-auto bg-slate-50"
      style={{ "--primaryColor": primaryColor } as React.CSSProperties}
    >
      <div className="mx-auto w-full max-w-6xl flex-1 p-6 sm:p-8 md:p-10">
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                PQRs
              </h1>
              <p className="mt-2 text-base text-slate-500 sm:text-lg">
                Peticiones, Quejas y Reclamos de clientes
              </p>
              <p className="mt-2 text-sm font-medium text-slate-600">
                {pqrs?.length ?? 0} registro{(pqrs?.length ?? 0) !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus className="size-5" strokeWidth={2} />
              Nuevo PQR
            </button>
          </div>
        </header>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" strokeWidth={2} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cliente o asunto…"
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="all">Todos los tipos</option>
              {(["petition", "complaint", "claim"] as const).map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="all">Todos los estados</option>
              {(["open", "in_progress", "resolved", "closed"] as const).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Lista de PQRs</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {pqrs === undefined ? (
              <div className="py-12 text-center text-sm text-slate-500">Cargando…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <MessageSquare className="mx-auto size-12 text-slate-300" strokeWidth={1.5} />
                <p className="mt-4 text-sm font-medium text-slate-600">No hay PQRs</p>
                <p className="mt-1 text-sm text-slate-500">
                  Registra peticiones, quejas o reclamos de tus clientes
                </p>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Plus className="size-4" /> Nuevo PQR
                </button>
              </div>
            ) : (
              filtered.map((p) => {
                const Icon = TYPE_ICONS[p.type];
                return (
                  <div
                    key={p._id}
                    className="flex flex-col gap-3 px-5 py-4 transition hover:bg-slate-50/80 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => setDetailId(p._id)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon className="size-4 text-slate-500" strokeWidth={2} />
                        <span className="font-semibold text-slate-900">{p.customerName}</span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            p.type === "petition" && "bg-blue-100 text-blue-800",
                            p.type === "complaint" && "bg-amber-100 text-amber-800",
                            p.type === "claim" && "bg-rose-100 text-rose-800",
                            p.type === "suggestion" && "bg-violet-100 text-violet-800",
                            p.type === "compliment" && "bg-emerald-100 text-emerald-800"
                          )}
                        >
                          {TYPE_LABELS[p.type]}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            p.status === "open" && "bg-slate-100 text-slate-700",
                            p.status === "in_progress" && "bg-cyan-100 text-cyan-800",
                            p.status === "resolved" && "bg-emerald-100 text-emerald-800",
                            p.status === "closed" && "bg-slate-100 text-slate-600"
                          )}
                        >
                          {STATUS_LABELS[p.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-700">{p.subject}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{p.description}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {new Date(p.createdAt).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDetailId(p._id)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Ver detalle
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(p._id)}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal crear */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md border-slate-200 bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Nuevo PQR</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tipo *</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as PqrType }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-900/5"
              >
                {(["petition", "complaint", "claim"] as const).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="pqr-anonymous"
                checked={form.anonymous}
                onChange={(e) => setForm((f) => ({ ...f, anonymous: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <label htmlFor="pqr-anonymous" className="text-sm font-medium text-slate-700">
                PQR anónima
              </label>
            </div>
            {!form.anonymous && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nombre del cliente *</label>
                <input
                  type="text"
                  required
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="Ej. Juan Pérez"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-900/5"
                />
              </div>
            )}
            {!form.anonymous && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))}
                  placeholder="cliente@email.com"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-900/5"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Teléfono</label>
                <input
                  type="tel"
                  value={form.customerPhone}
                  onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="+57 300 123 4567"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-900/5"
                />
              </div>
            </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Asunto *</label>
              <input
                type="text"
                required
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Resumen del PQR"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Descripción *</label>
              <textarea
                required
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Detalle completo del petición, queja o reclamo..."
                rows={4}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-900/5"
              />
            </div>
            <DialogFooter className="gap-2 pt-4">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? "Creando…" : "Crear PQR"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal detalle */}
      <Dialog open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent className="max-w-md border-slate-200 bg-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Detalle del PQR</DialogTitle>
          </DialogHeader>
          {detailPqr && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    detailPqr.type === "petition" && "bg-blue-100 text-blue-800",
                    detailPqr.type === "complaint" && "bg-amber-100 text-amber-800",
                    detailPqr.type === "claim" && "bg-rose-100 text-rose-800",
                    detailPqr.type === "suggestion" && "bg-violet-100 text-violet-800",
                    detailPqr.type === "compliment" && "bg-emerald-100 text-emerald-800"
                  )}
                >
                  {TYPE_LABELS[detailPqr.type]}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium",
                    detailPqr.status === "open" && "bg-slate-100 text-slate-700",
                    detailPqr.status === "in_progress" && "bg-cyan-100 text-cyan-800",
                    detailPqr.status === "resolved" && "bg-emerald-100 text-emerald-800",
                    detailPqr.status === "closed" && "bg-slate-100 text-slate-600"
                  )}
                >
                  {STATUS_LABELS[detailPqr.status]}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Cliente</p>
                <p className="font-semibold text-slate-900">{detailPqr.customerName}</p>
                {detailPqr.customerEmail && (
                  <p className="text-sm text-slate-600">{detailPqr.customerEmail}</p>
                )}
                {detailPqr.customerPhone && (
                  <a href={`tel:${detailPqr.customerPhone}`} className="text-sm text-slate-600 hover:underline">
                    {detailPqr.customerPhone}
                  </a>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Asunto</p>
                <p className="font-semibold text-slate-900">{detailPqr.subject}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Descripción</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailPqr.description}</p>
              </div>
              {detailPqr.resolutionNotes && (
                <div>
                  <p className="text-sm font-medium text-slate-500">Notas de resolución</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailPqr.resolutionNotes}</p>
                </div>
              )}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-medium text-slate-700">Notificación por correo</p>
                <p className="mt-1 text-xs text-slate-500">
                  Reenvía al área correspondiente. Si el cliente tiene email, recibe copia (CC).
                </p>
                {resendMessage && (
                  <p
                    className={cn(
                      "mt-2 text-xs",
                      resendMessage.startsWith("Correo reenviado")
                        ? "text-emerald-700"
                        : "text-rose-700"
                    )}
                  >
                    {resendMessage}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleResendEmail}
                  disabled={resending}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {resending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Mail className="size-4" strokeWidth={2} />
                  )}
                  {resending ? "Reenviando…" : "Reenviar correo"}
                </button>
              </div>
              {detailPqr.status === "open" || detailPqr.status === "in_progress" ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Notas de resolución</label>
                    <textarea
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      placeholder="Describa cómo se resolvió..."
                      rows={3}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-900/5"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(detailPqr._id, "in_progress")}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      En proceso
                    </button>
                    <button
                      type="button"
                      onClick={handleResolve}
                      disabled={saving}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      Resolver
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(detailPqr._id, "closed")}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cerrar
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar PQR?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El registro se eliminará permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
