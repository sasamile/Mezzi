"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import { UserPlus, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function UsuariosSuperadminPage() {
  const users = useQuery(api.superadmin.listSuperadminUsers);
  const registerSuperadmin = useMutation(api.auth.registerSuperadmin);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpenCreate = () => {
    setForm({ name: "", email: "", password: "" });
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError("Completa todos los campos.");
      return;
    }
    if (form.password.length < 5) {
      setError("La contraseña debe tener al menos 5 caracteres.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await registerSuperadmin({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setShowModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear superadmin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 bg-[#F8FAFC] h-full rounded-3xl">
      <div className="mx-auto max-w-[1000px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="space-y-8">
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-[#0F172A]">
                Usuarios superadmin
              </h1>
              <p className="mt-1 text-sm text-[#64748B]">
                Gestiona quiénes tienen acceso al panel de superadmin.
              </p>
            </div>
            <Button
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2"
            >
              <UserPlus className="h-4 w-4" />
              Agregar superadmin
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_8px_20px_rgba(0,0,0,0.05)]">
            {users === undefined ? (
              <div className="p-12 text-center text-sm text-[#64748B]">
                Cargando usuarios...
              </div>
            ) : users.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-[#64748B]">
                  No hay usuarios superadmin. Agrega el primero.
                </p>
                <Button
                  onClick={handleOpenCreate}
                  variant="outline"
                  className="mt-4"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Agregar superadmin
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Usuario
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Email
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#64748B]">
                        Fecha de registro
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u._id}
                        className="border-b border-[#F1F5F9] transition hover:bg-[#F8FAFC]"
                      >
                        <td className="flex items-center gap-3 px-6 py-4">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                            {u.name?.[0]?.toUpperCase() ?? "?"}
                          </span>
                          <span className="font-medium text-[#0F172A]">
                            {u.name ?? "—"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#64748B]">
                          {u.email}
                        </td>
                        <td className="px-6 py-4 text-sm text-[#64748B]">
                          {new Date(u.createdAt).toLocaleDateString("es-CL", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal agregar superadmin */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar superadmin</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Juan Pérez"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 5 caracteres"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowModal(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creando..." : "Crear superadmin"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
