"use client";

import { resolvePrimaryColor } from "@/lib/tenant-theme";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { useRequireModule } from "@/lib/use-require-module";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { Package, Plus, Search, Trash2, Truck } from "lucide-react";
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


type RequestStatus = "pending" | "sent" | "cancelled";

const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Pendiente",
  sent: "Despachado",
  cancelled: "Cancelado",
};

type ProductLine = { product: string; quantity: string; unit: string };

function parseItems(items: string): ProductLine[] {
  try {
    const arr = JSON.parse(items);
    if (!Array.isArray(arr)) return [];
    return arr.map((x: { product?: string; quantity?: string; unit?: string }) => ({
      product: String(x?.product ?? "").trim(),
      quantity: String(x?.quantity ?? "").trim(),
      unit: String(x?.unit ?? "").trim(),
    })).filter((p) => p.product || p.quantity);
  } catch {
    return [];
  }
}

function productLinesToItems(lines: ProductLine[]): string {
  const arr = lines
    .filter((p) => p.product.trim())
    .map((p) => ({
      product: p.product.trim(),
      quantity: p.quantity.trim() || "1",
      unit: p.unit.trim() || undefined,
    }));
  return JSON.stringify(arr.length ? arr : []);
}

export default function SolicitudesPage() {
  useRequireModule("pedidos");
  const { tenantId } = useTenant();
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<Id<"requests"> | null>(null);
  const [deleteId, setDeleteId] = React.useState<Id<"requests"> | null>(null);
  const [form, setForm] = React.useState({
    distributorName: "",
    productLines: [{ product: "", quantity: "", unit: "" }] as ProductLine[],
    customerName: "",
    customerPhone: "",
    address: "",
    recipientName: "",
    notes: "",
  });
  const [saving, setSaving] = React.useState(false);

  const tenant = useQuery(api.tenants.get, tenantId ? { tenantId } : "skip");
  const requests = useQuery(
    api.requests.list,
    tenantId ? { tenantId, status: statusFilter !== "all" ? statusFilter : undefined } : "skip"
  );
  const createRequest = useMutation(api.requests.create);
  const updateRequest = useMutation(api.requests.update);
  const removeRequest = useMutation(api.requests.remove);

  const primaryColor = resolvePrimaryColor(tenant?.primaryColor);

  const filtered = React.useMemo(() => {
    const list = requests ?? [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (r) =>
        r.distributorName.toLowerCase().includes(q) ||
        r.items.toLowerCase().includes(q) ||
        (r.customerName && r.customerName.toLowerCase().includes(q)) ||
        (r.customerPhone && r.customerPhone.includes(q)) ||
        (r.address && r.address.toLowerCase().includes(q)) ||
        (r.recipientName && r.recipientName.toLowerCase().includes(q))
    );
  }, [requests, searchQuery]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    if (!form.distributorName.trim()) return;
    if (!form.customerName.trim()) {
      alert("Indica el nombre del cliente");
      return;
    }
    if (!form.customerPhone.trim()) {
      alert("Indica el teléfono para poder notificar al cliente");
      return;
    }
    if (!form.address.trim()) {
      alert("Indica la dirección de entrega");
      return;
    }
    if (!form.recipientName.trim()) {
      alert("Indica quién recibe el pedido");
      return;
    }
    const items = productLinesToItems(form.productLines);
    if (items === "[]" || !form.productLines.some((p) => p.product.trim())) {
      alert("Añade al menos un producto con cantidad");
      return;
    }
    setSaving(true);
    try {
      await createRequest({
        tenantId,
        distributorName: form.distributorName.trim(),
        items,
        customerName: form.customerName.trim() || undefined,
        customerPhone: form.customerPhone.trim() || undefined,
        address: form.address.trim() || undefined,
        recipientName: form.recipientName.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setCreateOpen(false);
      setForm({ distributorName: "", productLines: [{ product: "", quantity: "", unit: "" }], customerName: "", customerPhone: "", address: "", recipientName: "", notes: "" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    if (!form.distributorName.trim()) return;
    setSaving(true);
    try {
      await updateRequest({
        requestId: editId,
        distributorName: form.distributorName.trim(),
        items: productLinesToItems(form.productLines),
        customerName: form.customerName.trim() || undefined,
        customerPhone: form.customerPhone.trim() || undefined,
        address: form.address.trim() || undefined,
        recipientName: form.recipientName.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setEditId(null);
      setForm({ distributorName: "", productLines: [{ product: "", quantity: "", unit: "" }], customerName: "", customerPhone: "", address: "", recipientName: "", notes: "" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await removeRequest({ requestId: deleteId });
      setDeleteId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  const openEdit = (r: {
    _id: Id<"requests">;
    distributorName: string;
    items: string;
    customerName?: string;
    customerPhone?: string;
    address?: string;
    recipientName?: string;
    notes?: string;
  }) => {
    setEditId(r._id);
    const lines = parseItems(r.items);
    setForm({
      distributorName: r.distributorName,
      productLines: lines.length ? lines : [{ product: "", quantity: "", unit: "" }],
      customerName: r.customerName ?? "",
      customerPhone: r.customerPhone ?? "",
      address: r.address ?? "",
      recipientName: r.recipientName ?? "",
      notes: r.notes ?? "",
    });
  };

  const setProductLine = (index: number, field: keyof ProductLine, value: string) => {
    setForm((f) => ({
      ...f,
      productLines: f.productLines.map((line, i) =>
        i === index ? { ...line, [field]: value } : line
      ),
    }));
  };
  const addProductLine = () => {
    setForm((f) => ({
      ...f,
      productLines: [...f.productLines, { product: "", quantity: "", unit: "" }],
    }));
  };
  const removeProductLine = (index: number) => {
    setForm((f) => ({
      ...f,
      productLines: f.productLines.filter((_, i) => i !== index).length
        ? f.productLines.filter((_, i) => i !== index)
        : [{ product: "", quantity: "", unit: "" }],
    }));
  };

  if (!tenantId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-full flex-col overflow-y-auto bg-muted/40"
      style={{ "--primaryColor": primaryColor } as React.CSSProperties}
    >
      <div className="w-full flex-1 p-4 md:p-6 lg:p-8">
        <header className="mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Pedidos
              </h1>
              <p className="mt-2 text-base text-muted-foreground sm:text-lg">
                Productos del menú; al marcar Enviado se notifica al cliente por WhatsApp
              </p>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                {requests?.length ?? 0} pedido{(requests?.length ?? 0) !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setForm({ distributorName: "", productLines: [{ product: "", quantity: "", unit: "" }], customerName: "", customerPhone: "", address: "", recipientName: "", notes: "" });
                setCreateOpen(true);
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus className="size-5" strokeWidth={2} />
              Nuevo pedido
            </button>
          </div>
        </header>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por distribuidor, producto, cliente, dirección…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <option value="all">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="sent">Despachado</option>
            <option value="cancelled">Cancelados</option>
          </select>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Lista de pedidos</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {requests === undefined ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Cargando…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Truck className="mx-auto size-12 text-slate-300" strokeWidth={1.5} />
                <p className="mt-4 text-sm font-medium text-muted-foreground">No hay pedidos</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crea un pedido; los productos pueden venir del menú en la base de conocimiento
                </p>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Plus className="size-4" /> Nuevo pedido
                </button>
              </div>
            ) : (
              filtered.map((r) => {
                const items = parseItems(r.items);
                return (
                  <div
                    key={r._id}
                    className="flex flex-col gap-3 px-5 py-4 transition hover:bg-muted/40/80 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{r.distributorName}</span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            r.status === "pending" && "bg-amber-100 text-amber-800",
                            r.status === "sent" && "bg-blue-100 text-blue-800",
                            r.status === "cancelled" && "bg-muted text-muted-foreground line-through",
                            r.status === "delivered" && "bg-muted text-muted-foreground"
                          )}
                        >
                          {r.status === "pending" ? "Pendiente" : r.status === "sent" ? "Despachado" : r.status === "cancelled" ? "Cancelado" : r.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {items.length > 0
                          ? items.map((i) => `${i.product} (${i.quantity} ${i.unit ?? "uds"})`).join(", ")
                          : "Sin detalle"}
                        {r.notes ? ` · ${r.notes}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.customerName}
                        {r.recipientName ? ` · Recibe: ${r.recipientName}` : ""}
                        {r.address ? ` · ${r.address}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(r.requestedAt).toLocaleDateString("es-ES", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={r.status}
                        onChange={(e) => {
                          const v = e.target.value as string;
                          if (["pending", "sent", "cancelled"].includes(v)) {
                            updateRequest({ requestId: r._id, status: v as "pending" | "sent" | "cancelled" });
                          }
                        }}
                        className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
                      >
                        <option value="pending">Pendiente</option>
                        <option value="sent">Despachado</option>
                        <option value="cancelled">Cancelado</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteId(r._id)}
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
<DialogContent className="max-w-lg border-border bg-card">
        <DialogHeader>
            <DialogTitle className="text-foreground">Nuevo pedido</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4" noValidate>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Distribuidor / Origen *</label>
              <input
                type="text"
                required
                value={form.distributorName}
                onChange={(e) => setForm((f) => ({ ...f, distributorName: e.target.value }))}
                placeholder="Ej. Coca-Cola, Bavaria"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Cliente (nombre) *</label>
              <input
                type="text"
                required
                value={form.customerName}
                onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                placeholder="Nombre del cliente"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Teléfono cliente (para notificar) *</label>
              <input
                type="text"
                required
                value={form.customerPhone}
                onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                placeholder="+57 300 123 4567"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Dirección de entrega *</label>
              <input
                type="text"
                required
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Calle 123, ciudad"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Quién recibe *</label>
              <input
                type="text"
                required
                value={form.recipientName}
                onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
                placeholder="Nombre de quien recibe"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Productos *</label>
              <div className="space-y-3 rounded-lg border border-border bg-muted/40/50 p-3">
                {form.productLines.map((line, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={line.product}
                      onChange={(e) => setProductLine(index, "product", e.target.value)}
                      placeholder="Producto"
                      className="min-w-[120px] flex-1 rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(e) => setProductLine(index, "quantity", e.target.value)}
                      placeholder="Cant."
                      className="w-16 rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground text-center"
                    />
                    <input
                      type="text"
                      value={line.unit}
                      onChange={(e) => setProductLine(index, "unit", e.target.value)}
                      placeholder="Unidad"
                      className="w-20 rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => removeProductLine(index)}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-slate-200 hover:text-foreground"
                      title="Quitar línea"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addProductLine}
                  className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-4" /> Añadir producto
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Al menos un producto con cantidad. El bot del inbox también puede crear pedidos.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Notas (observaciones)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Ej. Sin cebolla, sin picante, instrucciones especiales, alergias..."
                rows={2}
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <DialogFooter className="gap-2 pt-4">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? "Creando…" : "Crear pedido"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal editar */}
      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
<DialogContent className="max-w-lg border-border bg-card">
        <DialogHeader>
            <DialogTitle className="text-foreground">Editar pedido</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Distribuidor / Origen *</label>
              <input
                type="text"
                required
                value={form.distributorName}
                onChange={(e) => setForm((f) => ({ ...f, distributorName: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Cliente (nombre) *</label>
              <input
                type="text"
                required
                value={form.customerName}
                onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                placeholder="Nombre del cliente"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Teléfono cliente (para notificar) *</label>
              <input
                type="text"
                required
                value={form.customerPhone}
                onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                placeholder="+57 300 123 4567"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Dirección de entrega *</label>
              <input
                type="text"
                required
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Calle 123, ciudad"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Quién recibe *</label>
              <input
                type="text"
                required
                value={form.recipientName}
                onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
                placeholder="Nombre de quien recibe"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Productos *</label>
              <div className="space-y-3 rounded-lg border border-border bg-muted/40/50 p-3">
                {form.productLines.map((line, index) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={line.product}
                      onChange={(e) => setProductLine(index, "product", e.target.value)}
                      placeholder="Producto"
                      className="min-w-[120px] flex-1 rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(e) => setProductLine(index, "quantity", e.target.value)}
                      placeholder="Cant."
                      className="w-16 rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground text-center"
                    />
                    <input
                      type="text"
                      value={line.unit}
                      onChange={(e) => setProductLine(index, "unit", e.target.value)}
                      placeholder="Unidad"
                      className="w-20 rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => removeProductLine(index)}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-slate-200 hover:text-foreground"
                      title="Quitar línea"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addProductLine}
                  className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-4" /> Añadir producto
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Notas</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <DialogFooter className="gap-2 pt-4">
              <button
                type="button"
                onClick={() => setEditId(null)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El pedido se eliminará permanentemente.
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
