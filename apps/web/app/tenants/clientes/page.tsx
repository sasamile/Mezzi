"use client";

import { resolvePrimaryColor } from "@/lib/tenant-theme";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { sileo } from "@/lib/toast";
import { Search, UserPlus, Pencil, Trash2, Phone, Mail } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


type CustomerDoc = {
  _id: Id<"customers">;
  tenantId: Id<"tenants">;
  externalContactId: string;
  name: string;
  email?: string;
  notes?: string;
  preferences?: string;
  lastContactAt: number;
  createdAt: number;
  updatedAt: number;
};

function formatPhone(contactId: string) {
  const m = contactId.replace(/^whatsapp:/i, "").trim();
  return m || contactId;
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  if (today) return `Hoy ${d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (yesterday.toDateString() === d.toDateString()) return `Ayer ${d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

export default function ClientesPage() {
  const { tenantId } = useTenant();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingCustomer, setEditingCustomer] = React.useState<CustomerDoc | null>(null);
  const [deleteCustomer, setDeleteCustomer] = React.useState<CustomerDoc | null>(null);

  const tenant = useQuery(api.tenants.get, tenantId ? { tenantId } : "skip");
  const customers = useQuery(
    api.customers.listByTenant,
    tenantId ? { tenantId } : "skip"
  ) as CustomerDoc[] | undefined;

  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);
  const removeCustomer = useMutation(api.customers.remove);

  const primaryColor = resolvePrimaryColor(tenant?.primaryColor);

  const filtered = React.useMemo(() => {
    const list = customers ?? [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.externalContactId.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.notes ?? "").toLowerCase().includes(q) ||
        (c.preferences ?? "").toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tenantId) return;
    const form = e.currentTarget;
    const name = (form.querySelector('[name="name"]') as HTMLInputElement)?.value?.trim();
    const externalContactId = (form.querySelector('[name="externalContactId"]') as HTMLInputElement)?.value?.trim();
    const email = (form.querySelector('[name="email"]') as HTMLInputElement)?.value?.trim();
    const notes = (form.querySelector('[name="notes"]') as HTMLTextAreaElement)?.value?.trim();
    const preferences = (form.querySelector('[name="preferences"]') as HTMLTextAreaElement)?.value?.trim();
    if (!name || !externalContactId) {
      sileo.error({ title: "Campos requeridos", description: "Nombre y teléfono son obligatorios." });
      return;
    }
    const contactId = externalContactId.includes(":") ? externalContactId : `whatsapp:${externalContactId}`;
    try {
      await createCustomer({
        tenantId,
        externalContactId: contactId,
        name,
        email: email || undefined,
        notes: notes || undefined,
        preferences: preferences || undefined,
      });
      sileo.success({ title: "Cliente creado", description: "La información se usará en el chat para personalizar respuestas." });
      setCreateOpen(false);
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "No se pudo crear el cliente." });
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCustomer) return;
    const form = e.currentTarget;
    const name = (form.querySelector('[name="name"]') as HTMLInputElement)?.value?.trim();
    const email = (form.querySelector('[name="email"]') as HTMLInputElement)?.value?.trim();
    const notes = (form.querySelector('[name="notes"]') as HTMLTextAreaElement)?.value?.trim();
    const preferences = (form.querySelector('[name="preferences"]') as HTMLTextAreaElement)?.value?.trim();
    try {
      await updateCustomer({
        id: editingCustomer._id,
        name: name ?? editingCustomer.name,
        email: email || undefined,
        notes: notes || undefined,
        preferences: preferences || undefined,
      });
      sileo.success({ title: "Cliente actualizado", description: "Los cambios se aplicarán en las próximas conversaciones." });
      setEditingCustomer(null);
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "No se pudo actualizar." });
    }
  };

  const handleDelete = async () => {
    if (!deleteCustomer) return;
    try {
      await removeCustomer({ id: deleteCustomer._id });
      sileo.success({ title: "Cliente eliminado", description: "Se eliminó la ficha del cliente." });
      setDeleteCustomer(null);
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "No se pudo eliminar." });
    }
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
                Clientes
              </h1>
              <p className="mt-2 text-base text-muted-foreground sm:text-lg">
                Información de clientes para que la IA responda de forma personalizada por teléfono.
              </p>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                {filtered.length} cliente{filtered.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98]"
              style={{ backgroundColor: primaryColor }}
            >
              <UserPlus className="size-5" strokeWidth={2} />
              Nuevo cliente
            </button>
          </div>
        </header>

        <div className="mb-6">
          <div className="relative max-w-sm">
            <Search
              className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, teléfono, email…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Listado</h2>
          </div>
          <div className="overflow-x-auto">
            {customers === undefined ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Cargando…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {searchQuery.trim() ? "Ningún cliente coincide con la búsqueda." : "Aún no hay clientes. Se crearán al chatear por WhatsApp o puedes agregar uno manualmente."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40/80 text-left text-muted-foreground">
                    <th className="px-4 py-4 font-medium align-middle">Nombre</th>
                    <th className="px-4 py-4 font-medium align-middle">Teléfono</th>
                    <th className="px-4 py-4 font-medium align-middle hidden sm:table-cell">Email</th>
                    <th className="px-4 py-4 font-medium align-middle hidden md:table-cell">Último contacto</th>
                    <th className="px-4 py-4 w-28 align-middle text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c._id} className="border-b border-border hover:bg-muted/40/50 transition-colors">
                      <td className="px-4 py-4 align-middle font-medium text-foreground">{c.name}</td>
                      <td className="px-4 py-4 align-middle text-muted-foreground">
                        <span className="inline-flex items-center gap-2">
                          <Phone className="size-4 shrink-0 text-muted-foreground" />
                          <span>{formatPhone(c.externalContactId)}</span>
                        </span>
                      </td>
                      <td className="px-4 py-4 align-middle text-muted-foreground hidden sm:table-cell">
                        {c.email ? (
                          <span className="inline-flex items-center gap-2">
                            <Mail className="size-4 shrink-0 text-muted-foreground" />
                            <span>{c.email}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 align-middle text-muted-foreground hidden md:table-cell">{formatDate(c.lastContactAt)}</td>
                      <td className="px-4 py-4 align-middle text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingCustomer(c)}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            title="Editar"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteCustomer(c)}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Modal crear */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="create-name">Nombre *</Label>
              <Input id="create-name" name="name" required className="mt-1" placeholder="Ej. Juan Pérez" />
            </div>
            <div>
              <Label htmlFor="create-phone">Teléfono (WhatsApp) *</Label>
              <Input id="create-phone" name="externalContactId" required className="mt-1" placeholder="+57 300 123 4567" />
            </div>
            <div>
              <Label htmlFor="create-email">Email</Label>
              <Input id="create-email" name="email" type="email" className="mt-1" placeholder="cliente@ejemplo.com" />
            </div>
            <div>
              <Label htmlFor="create-notes">Notas</Label>
              <textarea id="create-notes" name="notes" className="mt-1 min-h-[80px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200" placeholder="Información útil para el equipo" />
            </div>
            <div>
              <Label htmlFor="create-prefs">Preferencias</Label>
              <textarea id="create-prefs" name="preferences" className="mt-1 min-h-[80px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200" placeholder="Ej. Sin gluten, mesa junto a la ventana" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" style={{ backgroundColor: primaryColor }}>Crear</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal editar */}
      <Dialog open={!!editingCustomer} onOpenChange={(open) => !open && setEditingCustomer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
          </DialogHeader>
          {editingCustomer && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Nombre *</Label>
                <Input id="edit-name" name="name" defaultValue={editingCustomer.name} required className="mt-1" />
              </div>
              <div className="text-sm text-muted-foreground">
                Teléfono: {formatPhone(editingCustomer.externalContactId)} (no editable)
              </div>
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" name="email" type="email" defaultValue={editingCustomer.email ?? ""} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="edit-notes">Notas</Label>
                <textarea id="edit-notes" name="notes" defaultValue={editingCustomer.notes ?? ""} className="mt-1 min-h-[80px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200" />
              </div>
              <div>
                <Label htmlFor="edit-prefs">Preferencias</Label>
                <textarea id="edit-prefs" name="preferences" defaultValue={editingCustomer.preferences ?? ""} className="mt-1 min-h-[80px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingCustomer(null)}>Cancelar</Button>
                <Button type="submit" style={{ backgroundColor: primaryColor }}>Guardar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCustomer} onOpenChange={(open) => !open && setDeleteCustomer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la ficha de {deleteCustomer?.name}. El historial de conversaciones no se borra. La IA dejará de usar esta información para ese número.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
