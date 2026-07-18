"use client";

import { resolvePrimaryColor } from "@/lib/tenant-theme";

import * as React from "react";
import { Suspense } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useRequireModule } from "@/lib/use-require-module";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { useSearchParams } from "next/navigation";
import { ReservasHeader, type ViewMode } from "@/components/reservas/reservas-header";
import { ReservasTabs, type FilterTab } from "@/components/reservas/reservas-tabs";
import { CalendarGrid } from "@/components/reservas/calendar-grid";
import { ReservasListView } from "@/components/reservas/reservas-list-view";
import { ReservationDialog } from "@/components/reservas/reservation-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Settings, Users, Smartphone, Store, Clock } from "lucide-react";

const DEFAULT_SECONDARY = "#06b6d4";

function getDayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function getWeekStart(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

type Reservation = {
  _id: Id<"reservations">;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  startTime: number;
  endTime: number;
  tableNumber?: string;
  numberOfPeople?: number;
  notes?: string;
  status: "confirmed" | "pending" | "cancelled" | "completed" | "no_show";
  source?: string;
  extraData?: string;
  googleEventId?: string;
};

function ReservasContent() {
  useRequireModule("reservas");
  const { tenantId } = useTenant();
  const searchParams = useSearchParams();
  const googleStatus = searchParams?.get("google");
  const [showGoogleBanner, setShowGoogleBanner] = React.useState(!!googleStatus);
  const [currentDate, setCurrentDate] = React.useState(() => new Date());
  const [viewMode, setViewMode] = React.useState<ViewMode>("day");
  const [filterTab, setFilterTab] = React.useState<FilterTab>("todas");
  const [selectedReservation, setSelectedReservation] = React.useState<Reservation | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [newReservationOpen, setNewReservationOpen] = React.useState(false);
  const [editReservationOpen, setEditReservationOpen] = React.useState(false);
  const [newReservationForm, setNewReservationForm] = React.useState({
    date: "",
    time: "19:00",
    durationMinutes: 120,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    tableNumber: "",
    numberOfPeople: "" as string | number,
    notes: "",
  });
  const [editReservationForm, setEditReservationForm] = React.useState({
    reservationId: "" as Id<"reservations"> | "",
    date: "",
    time: "19:00",
    durationMinutes: 120,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    tableNumber: "",
    numberOfPeople: "" as string | number,
    notes: "",
  });
  const [creating, setCreating] = React.useState(false);
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [configOpen, setConfigOpen] = React.useState(false);
  const [configForm, setConfigForm] = React.useState({
    maxReservationsPerDay: 20,
    maxVirtualPerDay: 10,
    maxPresencialPerDay: 15,
    defaultDurationMinutes: 120,
  });
  const [savingConfig, setSavingConfig] = React.useState(false);
  const [configSaved, setConfigSaved] = React.useState(false);

  const dayStart = getDayStart(currentDate);
  const weekStart = getWeekStart(currentDate);
  const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000 - 1;

  const tenant = useQuery(api.tenants.get, tenantId ? { tenantId } : "skip");
  const allReservations = useQuery(
    api.reservations.listByDateRange,
    tenantId
      ? {
          tenantId,
          startTime: viewMode === "week" ? weekStart : dayStart,
          endTime: viewMode === "week" ? weekEnd : dayStart + 24 * 60 * 60 * 1000 - 1,
          includeCancelled: true,
        }
      : "skip"
  );
  const googleCalendar = useQuery(
    api.googleCalendar.get,
    tenantId ? { tenantId } : "skip"
  );
  const config = useQuery(
    api.reservationConfig.getOrDefault,
    tenantId ? { tenantId } : "skip"
  );

  const saveConfig = useMutation(api.reservationConfig.save);
  const createReservation = useMutation(api.reservations.create);
  const updateReservation = useMutation(api.reservations.update);
  const confirmArrival = useMutation(api.reservations.confirmArrival);
  const markNoShow = useMutation(api.reservations.markNoShow);
  const cancelReservation = useMutation(api.reservations.cancel);
  const deleteReservation = useMutation(api.reservations.deleteReservation);
  const freeTable = useMutation(api.reservations.freeTable);
  const importFromGoogle = useAction(api.googleCalendarImport.importFromGoogle);

  const primaryColor = resolvePrimaryColor(tenant?.primaryColor);
  const secondaryColor = tenant?.secondaryColor ?? DEFAULT_SECONDARY;

  const todayStart = getDayStart(new Date());
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;

  const counts = React.useMemo(() => {
    const rows = allReservations ?? [];
    const todayRows = rows.filter((r) => r.startTime >= todayStart && r.startTime <= todayEnd);
    const scopedRows =
      viewMode === "week"
        ? rows
        : rows.filter((r) => r.startTime >= dayStart && r.startTime <= dayStart + 24 * 60 * 60 * 1000 - 1);
    return {
      todas: rows.length,
      hoy: todayRows.length,
      confirmadas: rows.filter((r) => r.status === "confirmed" || r.status === "completed").length,
      pendientes: rows.filter((r) => r.status === "pending").length,
      no_show: rows.filter((r) => r.status === "no_show").length,
      canceladas: rows.filter((r) => r.status === "cancelled").length,
      scopeTotal: scopedRows.filter((r) => r.status !== "cancelled").length,
      scopeVirtual: scopedRows.filter((r) => r.status !== "cancelled" && r.source === "virtual").length,
      scopePresencial: scopedRows.filter((r) => r.status !== "cancelled" && r.source === "presencial").length,
    };
  }, [allReservations, todayStart, todayEnd, viewMode, dayStart]);

  const filteredReservations = React.useMemo(() => {
    const rows = allReservations ?? [];
    switch (filterTab) {
      case "todas":
        return rows;
      case "hoy":
        return rows.filter((r) => r.startTime >= todayStart && r.startTime <= todayEnd);
      case "confirmadas":
        return rows.filter((r) => r.status === "confirmed" || r.status === "completed");
      case "pendientes":
        return rows.filter((r) => r.status === "pending");
      case "no_show":
        return rows.filter((r) => r.status === "no_show");
      case "canceladas":
        return rows.filter((r) => r.status === "cancelled");
      default:
        return rows;
    }
  }, [allReservations, filterTab, todayStart, todayEnd]);

  React.useEffect(() => {
    if (googleStatus === "connected" && showGoogleBanner) {
      const t = setTimeout(() => setShowGoogleBanner(false), 4000);
      return () => clearTimeout(t);
    }
  }, [googleStatus, showGoogleBanner]);

  React.useEffect(() => {
    if (config) {
      setConfigForm({
        maxReservationsPerDay: config.maxReservationsPerDay ?? 20,
        maxVirtualPerDay: config.maxVirtualPerDay ?? 10,
        maxPresencialPerDay: config.maxPresencialPerDay ?? 15,
        defaultDurationMinutes: config.defaultDurationMinutes ?? 120,
      });
    }
  }, [config]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    setSavingConfig(true);
    try {
      await saveConfig({ tenantId, ...configForm });
      setConfigSaved(true);
      setTimeout(() => {
        setConfigSaved(false);
        setConfigOpen(false);
      }, 1200);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleNewReservation = () => {
    const d = new Date(currentDate);
    setNewReservationForm({
      date: d.toISOString().slice(0, 10),
      time: "19:00",
      durationMinutes: config?.defaultDurationMinutes ?? 120,
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      tableNumber: "",
      numberOfPeople: "",
      notes: "",
    });
    setNewReservationOpen(true);
  };

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    const { date, time, durationMinutes, customerName, customerPhone, customerEmail, tableNumber, numberOfPeople, notes } =
      newReservationForm;
    if (!date || !time || !customerName.trim()) return;
    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    const startDate = new Date(year, month - 1, day, hours, minutes || 0, 0);
    const endDate = new Date(startDate.getTime() + (durationMinutes || 120) * 60 * 1000);
    const parsedPeople = numberOfPeople !== "" ? parseInt(String(numberOfPeople), 10) : undefined;
    setCreating(true);
    try {
      await createReservation({
        tenantId,
        startTime: startDate.getTime(),
        endTime: endDate.getTime(),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        tableNumber: tableNumber.trim() || undefined,
        numberOfPeople: parsedPeople && !isNaN(parsedPeople) ? parsedPeople : undefined,
        notes: notes.trim() || undefined,
        source: "presencial",
      });
      setNewReservationOpen(false);
      setDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo crear la reserva.";
      alert(message);
    } finally {
      setCreating(false);
    }
  };

  const handleImportFromGoogle = async () => {
    if (!tenantId) return;
    setImporting(true);
    try {
      const res = await importFromGoogle({
        tenantId,
        timeMin: viewMode === "week" ? weekStart : dayStart,
        timeMax: (viewMode === "week" ? weekEnd : dayStart + 24 * 60 * 60 * 1000) + 7 * 24 * 60 * 60 * 1000,
      });
      if (res.error) alert(res.error);
    } finally {
      setImporting(false);
    }
  };

  const handleOpenEditReservation = (reservationId: Id<"reservations">) => {
    const row = (allReservations ?? []).find((r) => r._id === reservationId);
    if (!row) return;
    const start = new Date(row.startTime);
    const end = new Date(row.endTime);
    const durationMinutes = Math.max(30, Math.round((row.endTime - row.startTime) / (60 * 1000)));
    setEditReservationForm({
      reservationId: row._id,
      date: start.toISOString().slice(0, 10),
      time: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      durationMinutes,
      customerName: row.customerName ?? "",
      customerPhone: row.customerPhone ?? "",
      customerEmail: row.customerEmail ?? "",
      tableNumber: row.tableNumber ?? "",
      numberOfPeople: row.numberOfPeople ?? "",
      notes: row.notes ?? "",
    });
    setEditReservationOpen(true);
  };

  const handleSaveEditReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !editReservationForm.reservationId) return;
    const { date, time, durationMinutes, customerName, customerPhone, customerEmail, tableNumber, numberOfPeople, notes } =
      editReservationForm;
    if (!date || !time || !customerName.trim()) return;

    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    const startDate = new Date(year, month - 1, day, hours, minutes || 0, 0);
    const endDate = new Date(startDate.getTime() + (durationMinutes || 120) * 60 * 1000);
    const parsedPeople = numberOfPeople !== "" ? parseInt(String(numberOfPeople), 10) : undefined;

    setSavingEdit(true);
    try {
      await updateReservation({
        reservationId: editReservationForm.reservationId,
        startTime: startDate.getTime(),
        endTime: endDate.getTime(),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerEmail: customerEmail.trim() || undefined,
        tableNumber: tableNumber.trim() || undefined,
        numberOfPeople: parsedPeople && !isNaN(parsedPeople) ? parsedPeople : undefined,
        notes: notes.trim() || undefined,
      });
      setEditReservationOpen(false);
      setDialogOpen(false);
      setSelectedReservation(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo actualizar la reserva.";
      alert(message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleReservationClick = (r: Reservation) => {
    setSelectedReservation(r);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setSelectedReservation(null);
  };

  const runAction = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      closeDialog();
    } catch (e) {
      console.error(e);
    }
  };

  if (!tenantId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-full overflow-y-auto bg-[#f8fafc] p-6 sm:p-8"
      style={
        {
          "--primaryColor": primaryColor,
          "--secondaryColor": secondaryColor,
        } as React.CSSProperties
      }
    >
      <div className="w-full space-y-6 p-4 md:p-6 lg:p-8">
        {showGoogleBanner && googleStatus === "connected" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Google Calendar conectado. Las reservas se sincronizarán automáticamente.
          </div>
        )}

        <ReservasHeader
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onNewReservation={handleNewReservation}
          primaryColor={primaryColor}
          googleConnected={googleCalendar?.connected ?? false}
          onImportFromGoogle={handleImportFromGoogle}
          importing={importing}
          currentDate={currentDate}
          onPrev={() => {
            const d = new Date(currentDate);
            if (viewMode === "day") d.setDate(d.getDate() - 1);
            else d.setDate(d.getDate() - 7);
            setCurrentDate(d);
          }}
          onNext={() => {
            const d = new Date(currentDate);
            if (viewMode === "day") d.setDate(d.getDate() + 1);
            else d.setDate(d.getDate() + 7);
            setCurrentDate(d);
          }}
          onGoToday={() => setCurrentDate(new Date())}
        />

        {/* Indicador de cupos + botón configurar */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>Total/día:</span>
              <span className="font-semibold text-foreground">
                {counts.scopeTotal}
                <span className="font-normal text-muted-foreground">
                  {" "}/ {config?.maxReservationsPerDay ?? 20}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <span>WhatsApp:</span>
              <span className="font-semibold text-foreground">
                {counts.scopeVirtual}
                <span className="font-normal text-muted-foreground">
                  {" "}/ {config?.maxVirtualPerDay ?? 10}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span>Presencial:</span>
              <span className="font-semibold text-foreground">
                {counts.scopePresencial} / {config?.maxPresencialPerDay ?? 15}
              </span>
            </div>
          </div>
          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Configurar cupos
          </button>
        </div>

        <ReservasTabs
          activeTab={filterTab}
          onTabChange={setFilterTab}
          counts={counts}
          primaryColor={primaryColor}
        />

        {viewMode === "list" ? (
          <ReservasListView
            reservations={filteredReservations}
            onReservationClick={handleReservationClick}
            primaryColor={primaryColor}
          />
        ) : (
          <CalendarGrid
            viewMode={viewMode}
            dayStart={viewMode === "day" ? dayStart : weekStart}
            reservations={filteredReservations}
            onReservationClick={handleReservationClick}
            primaryColor={primaryColor}
          />
        )}
      </div>

      {/* Dialog detalle reserva */}
      {selectedReservation && (
        <ReservationDialog
          reservation={selectedReservation}
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setSelectedReservation(null);
          }}
          primaryColor={primaryColor}
          onConfirm={(id) =>
            runAction(() => confirmArrival({ reservationId: id }))
          }
          onCancel={(id) =>
            runAction(() => cancelReservation({ reservationId: id }))
          }
          onMarkNoShow={(id) =>
            runAction(() => markNoShow({ reservationId: id }))
          }
          onFreeTable={(id) =>
            runAction(() => freeTable({ reservationId: id }))
          }
          onDelete={(id) =>
            runAction(() => deleteReservation({ reservationId: id }))
          }
          onEdit={handleOpenEditReservation}
        />
      )}

      {/* Modal editar reserva */}
      <Dialog open={editReservationOpen} onOpenChange={setEditReservationOpen}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar reserva</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEditReservation} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Fecha</label>
                <input
                  type="date"
                  required
                  value={editReservationForm.date}
                  onChange={(e) => setEditReservationForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Hora</label>
                <input
                  type="time"
                  required
                  value={editReservationForm.time}
                  onChange={(e) => setEditReservationForm((f) => ({ ...f, time: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Duración (min)</label>
              <input
                type="number"
                min={30}
                max={480}
                value={editReservationForm.durationMinutes}
                onChange={(e) =>
                  setEditReservationForm((f) => ({
                    ...f,
                    durationMinutes: parseInt(e.target.value, 10) || 120,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Nombre *</label>
              <input
                type="text"
                required
                value={editReservationForm.customerName}
                onChange={(e) => setEditReservationForm((f) => ({ ...f, customerName: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Personas</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={editReservationForm.numberOfPeople}
                  onChange={(e) => setEditReservationForm((f) => ({ ...f, numberOfPeople: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Mesa / Zona</label>
                <input
                  type="text"
                  value={editReservationForm.tableNumber}
                  onChange={(e) => setEditReservationForm((f) => ({ ...f, tableNumber: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Teléfono</label>
              <input
                type="tel"
                value={editReservationForm.customerPhone}
                onChange={(e) => setEditReservationForm((f) => ({ ...f, customerPhone: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Email</label>
              <input
                type="email"
                value={editReservationForm.customerEmail}
                onChange={(e) => setEditReservationForm((f) => ({ ...f, customerEmail: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Observaciones</label>
              <textarea
                rows={2}
                value={editReservationForm.notes}
                onChange={(e) => setEditReservationForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full resize-none rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <DialogFooter className="gap-2 pt-4">
              <button
                type="button"
                onClick={() => setEditReservationOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {savingEdit ? "Guardando…" : "Guardar cambios"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog configuración de cupos */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Settings className="h-4 w-4" />
              Configurar cupos de reservas
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveConfig} className="space-y-5 pt-1">
            <p className="text-xs text-muted-foreground">
              Define cuántas reservas se pueden aceptar por día. El bot de WhatsApp
              respetará estos límites automáticamente.
            </p>

            {/* Total por día */}
            <div className="rounded-xl border border-border p-4 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Límite total por día</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Máximo de reservas (WhatsApp + presenciales) que se aceptan en un día.
              </p>
              <input
                type="number"
                min={1}
                max={999}
                required
                value={configForm.maxReservationsPerDay}
                onChange={(e) =>
                  setConfigForm((f) => ({
                    ...f,
                    maxReservationsPerDay: parseInt(e.target.value, 10) || 1,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>

            {/* WhatsApp */}
            <div className="rounded-xl border border-border p-4 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Límite por WhatsApp / chat</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Reservas que el bot puede crear vía WhatsApp por día.
              </p>
              <input
                type="number"
                min={0}
                max={999}
                required
                value={configForm.maxVirtualPerDay}
                onChange={(e) =>
                  setConfigForm((f) => ({
                    ...f,
                    maxVirtualPerDay: parseInt(e.target.value, 10) || 0,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>

            {/* Presencial */}
            <div className="rounded-xl border border-border p-4 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Límite presencial</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Reservas creadas manualmente desde el panel por día.
              </p>
              <input
                type="number"
                min={0}
                max={999}
                required
                value={configForm.maxPresencialPerDay}
                onChange={(e) =>
                  setConfigForm((f) => ({
                    ...f,
                    maxPresencialPerDay: parseInt(e.target.value, 10) || 0,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>

            {/* Duración por defecto */}
            <div className="rounded-xl border border-border p-4 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Duración por defecto (minutos)</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Tiempo reservado por mesa si no se especifica otro.
              </p>
              <input
                type="number"
                min={15}
                max={480}
                step={15}
                required
                value={configForm.defaultDurationMinutes}
                onChange={(e) =>
                  setConfigForm((f) => ({
                    ...f,
                    defaultDurationMinutes: parseInt(e.target.value, 10) || 120,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingConfig}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {configSaved ? "¡Guardado! ✓" : savingConfig ? "Guardando…" : "Guardar cambios"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal nueva reserva */}
      <Dialog open={newReservationOpen} onOpenChange={setNewReservationOpen}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-foreground">Nueva reserva</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateReservation} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Fecha</label>
                <input
                  type="date"
                  required
                  value={newReservationForm.date}
                  onChange={(e) => setNewReservationForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Hora</label>
                <input
                  type="time"
                  required
                  value={newReservationForm.time}
                  onChange={(e) => setNewReservationForm((f) => ({ ...f, time: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Duración (min)</label>
              <input
                type="number"
                min={30}
                max={480}
                value={newReservationForm.durationMinutes}
                onChange={(e) =>
                  setNewReservationForm((f) => ({
                    ...f,
                    durationMinutes: parseInt(e.target.value, 10) || 120,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Nombre *</label>
              <input
                type="text"
                required
                value={newReservationForm.customerName}
                onChange={(e) => setNewReservationForm((f) => ({ ...f, customerName: e.target.value }))}
                placeholder="Ej. Juan Pérez"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Teléfono</label>
              <input
                type="tel"
                value={newReservationForm.customerPhone}
                onChange={(e) => setNewReservationForm((f) => ({ ...f, customerPhone: e.target.value }))}
                placeholder="+34 612 345 678"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground ring-1 ring-slate-900/5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Personas *</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={500}
                  value={newReservationForm.numberOfPeople}
                  onChange={(e) => setNewReservationForm((f) => ({ ...f, numberOfPeople: e.target.value }))}
                  placeholder="Ej. 4"
                  className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground ring-1 ring-slate-900/5"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Mesa / Zona</label>
                <input
                  type="text"
                  value={newReservationForm.tableNumber}
                  onChange={(e) => setNewReservationForm((f) => ({ ...f, tableNumber: e.target.value }))}
                  placeholder="Ej. Party 1, Mesa 4"
                  className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground ring-1 ring-slate-900/5"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Observaciones</label>
              <textarea
                rows={2}
                value={newReservationForm.notes}
                onChange={(e) => setNewReservationForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Ej. Cumpleaños, decoración de aniversario, solicitud especial…"
                className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground ring-1 ring-slate-900/5 resize-none"
              />
            </div>
            <DialogFooter className="gap-2 pt-4">
              <button
                type="button"
                onClick={() => setNewReservationOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {creating ? "Creando…" : "Crear reserva"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ReservasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center">
          <p className="text-muted-foreground">Cargando Reservas…</p>
        </div>
      }
    >
      <ReservasContent />
    </Suspense>
  );
}
