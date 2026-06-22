"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { useRequireModule } from "@/lib/use-require-module";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { sileo } from "sileo";
import { Plus, MapPin, Pencil, Trash2, Bot } from "lucide-react";
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

const DEFAULT_PRIMARY = "#197fe6";
const VACANCY_OPTIONS = ["PARRILLERO", "MESERA", "CAJERO", "COCINERO", "AUXILIAR", "ADMINISTRATIVO"];

type JobLocationDoc = {
  _id: Id<"jobLocations">;
  tenantId: Id<"tenants">;
  city: string;
  mallName: string;
  isPrincipal?: boolean;
  vacancies: string[];
  createdAt: number;
  updatedAt: number;
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function TrabajaConNosotrosPage() {
  useRequireModule("trabajaConNosotros");
  const { tenantId } = useTenant();
  const [activeTab, setActiveTab] = React.useState<"ubicaciones">("ubicaciones");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<JobLocationDoc | null>(null);
  const [deleteId, setDeleteId] = React.useState<Id<"jobLocations"> | null>(null);
  const [form, setForm] = React.useState({
    city: "",
    cityIsNew: false, // true = mostrar input para crear nueva ciudad
    mallName: "",
    isPrincipal: false,
    vacancies: [] as string[],
    vacancyOther: "",
  });

  const tenant = useQuery(api.tenants.get, tenantId ? { tenantId } : "skip");
  const locations = useQuery(
    api.jobLocations.list,
    tenantId ? { tenantId } : "skip"
  ) as JobLocationDoc[] | undefined;

  // Ciudades existentes (de las ubicaciones ya creadas)
  const existingCities = React.useMemo(() => {
    const list = locations ?? [];
    return [...new Set(list.map((l) => l.city))].sort();
  }, [locations]);

  const createLocation = useMutation(api.jobLocations.create);
  const updateLocation = useMutation(api.jobLocations.update);
  const removeLocation = useMutation(api.jobLocations.remove);

  const primaryColor = tenant?.primaryColor ?? DEFAULT_PRIMARY;

  const openCreate = () => {
    setForm({
      city: "",
      cityIsNew: existingCities.length === 0, // si no hay ciudades, mostrar input para crear
      mallName: "",
      isPrincipal: false,
      vacancies: [],
      vacancyOther: "",
    });
    setCreateOpen(true);
    setEditing(null);
  };

  const openEdit = (loc: JobLocationDoc) => {
    setForm({
      city: loc.city,
      cityIsNew: !existingCities.includes(loc.city),
      mallName: loc.mallName,
      isPrincipal: loc.isPrincipal ?? false,
      vacancies: loc.vacancies,
      vacancyOther: loc.vacancies.filter((v) => !VACANCY_OPTIONS.includes(v)).join(", "),
    });
    setEditing(loc);
    setCreateOpen(false);
  };

  const closeForm = () => {
    setCreateOpen(false);
    setEditing(null);
    setForm({ city: "", cityIsNew: false, mallName: "", isPrincipal: false, vacancies: [], vacancyOther: "" });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !form.city.trim() || !form.mallName.trim()) return;
    const vacs = [
      ...form.vacancies,
      ...form.vacancyOther.split(",").map((v) => v.trim().toUpperCase()).filter(Boolean),
    ];
    try {
      await createLocation({
        tenantId,
        city: form.city.trim(),
        mallName: form.mallName.trim(),
        isPrincipal: form.isPrincipal,
        vacancies: vacs,
      });
      sileo.success({ title: "Ubicación creada", description: "El chat podrá informar sobre estas vacantes." });
      closeForm();
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "No se pudo crear." });
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const vacs = [
      ...form.vacancies,
      ...form.vacancyOther.split(",").map((v) => v.trim().toUpperCase()).filter(Boolean),
    ];
    try {
      await updateLocation({
        id: editing._id,
        city: form.city.trim(),
        mallName: form.mallName.trim(),
        isPrincipal: form.isPrincipal,
        vacancies: vacs,
      });
      sileo.success({ title: "Ubicación actualizada", description: "Cambios guardados." });
      closeForm();
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "No se pudo actualizar." });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await removeLocation({ id: deleteId });
      sileo.success({ title: "Ubicación eliminada", description: "Se eliminó correctamente." });
      setDeleteId(null);
    } catch (err) {
      sileo.error({ title: "Error", description: err instanceof Error ? err.message : "No se pudo eliminar." });
    }
  };

  const toggleVacancy = (v: string) => {
    setForm((f) => ({
      ...f,
      vacancies: f.vacancies.includes(v) ? f.vacancies.filter((x) => x !== v) : [...f.vacancies, v],
    }));
  };

  const byCity = React.useMemo(() => {
    const list = locations ?? [];
    return list.reduce<Record<string, JobLocationDoc[]>>((acc, loc) => {
      if (!acc[loc.city]) acc[loc.city] = [];
      acc[loc.city].push(loc);
      return acc;
    }, {});
  }, [locations]);

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
                Trabaja con Nosotros
              </h1>
              <p className="mt-2 text-base text-slate-500 sm:text-lg">
                Ciudades, sedes y vacantes que el bot usa en WhatsApp
              </p>
            </div>
            <Button
              onClick={openCreate}
              className="shrink-0 px-3 py-1.5 text-sm"
              style={{ backgroundColor: primaryColor }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nueva ubicación
            </Button>
          </div>
        </header>

        <div className="mb-6 flex gap-3 rounded-xl border border-sky-200 bg-sky-50/90 p-4 text-sm text-sky-950">
          <Bot className="size-5 shrink-0 mt-0.5 text-sky-700" strokeWidth={1.7} />
          <p>
            <strong>El asistente de WhatsApp lee esta información.</strong> Carga ciudades,
            centros comerciales o sedes y marca las vacantes activas (parrillero, mesera, etc.).
            Cuando alguien pregunte por trabajo, el bot responderá con lo que configures aquí.
          </p>
        </div>

        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 mb-6">
          <div
            className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium bg-slate-100 text-slate-900"
          >
            <MapPin className="h-4 w-4" />
            Ubicaciones y vacantes
          </div>
        </div>

        {activeTab === "ubicaciones" && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Ubicaciones por ciudad</h2>
            {!locations?.length ? (
              <p className="text-slate-500 py-8 text-center">
                No hay ubicaciones registradas. Agrega ciudades, centros comerciales y vacantes para que el chat pueda responder.
              </p>
            ) : (
              <div className="space-y-6">
                {Object.entries(byCity)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([city, locs]) => (
                    <div key={city}>
                      <h3 className="mb-2 font-medium text-slate-700">{city}</h3>
                      <div className="space-y-2">
                        {locs
                          .sort((a, b) => a.mallName.localeCompare(b.mallName))
                          .map((loc) => (
                            <div
                              key={loc._id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3"
                            >
                              <div>
                                <span className="font-medium text-slate-800">
                                  {loc.isPrincipal ? `${loc.mallName} (Principal)` : loc.mallName}
                                </span>
                                <span className="ml-2 text-sm text-slate-500">
                                  {loc.vacancies.length ? loc.vacancies.join(", ") : "Sin vacantes específicas"}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => openEdit(loc)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  className="h-8 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => setDeleteId(loc._id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Modal crear / editar */}
      <Dialog open={createOpen || !!editing} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar ubicación" : "Nueva ubicación"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={editing ? handleUpdate : handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="city">Ciudad</Label>
              {form.cityIsNew ? (
                <div className="mt-1 space-y-2">
                  <Input
                    id="city"
                    name="city"
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="Ej: Medellín, Bogotá, Barranquilla..."
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, cityIsNew: false, city: "" }))}
                    className="text-sm text-slate-500 hover:text-slate-700"
                  >
                    ← Seleccionar ciudad existente
                  </button>
                </div>
              ) : (
                <div className="mt-1 space-y-2">
                  <select
                    id="city"
                    value={form.city}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__new__") {
                        setForm((f) => ({ ...f, cityIsNew: true, city: "" }));
                      } else {
                        setForm((f) => ({ ...f, city: v }));
                      }
                    }}
                    required={!form.cityIsNew}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Selecciona una ciudad</option>
                    {existingCities.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__new__">➕ Crear nueva ciudad</option>
                  </select>
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="mallName">Centro comercial / Sede</Label>
              <Input
                id="mallName"
                name="mallName"
                value={form.mallName}
                onChange={(e) => setForm((f) => ({ ...f, mallName: e.target.value }))}
                placeholder="Mayorca, Viva Envigado, Santa Fe..."
                required
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPrincipal"
                checked={form.isPrincipal}
                onChange={(e) => setForm((f) => ({ ...f, isPrincipal: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <Label htmlFor="isPrincipal">Sede principal</Label>
            </div>
            <div>
              <Label>Vacantes</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {VACANCY_OPTIONS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleVacancy(v)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      form.vacancies.includes(v)
                        ? "bg-slate-800 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <Input
                value={form.vacancyOther}
                onChange={(e) => setForm((f) => ({ ...f, vacancyOther: e.target.value }))}
                placeholder="Otras vacantes (separadas por coma)"
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" style={{ backgroundColor: primaryColor }}>
                {editing ? "Guardar cambios" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ubicación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará esta ubicación y sus vacantes. El chat dejará de mencionarla.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
