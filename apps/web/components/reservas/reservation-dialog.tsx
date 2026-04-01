"use client";

import * as React from "react";
import {
  Phone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Edit,
  Trash2,
  User,
  Calendar,
  MapPin,
  Users,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

type ReservationStatus = "confirmed" | "pending" | "cancelled" | "completed" | "no_show";

interface Reservation {
  _id: Id<"reservations">;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  startTime: number;
  endTime: number;
  tableNumber?: string;
  numberOfPeople?: number;
  notes?: string;
  status: ReservationStatus;
  source?: string;
  extraData?: string;
  googleEventId?: string;
}

interface ReservationDialogProps {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryColor: string;
  onConfirm: (id: Id<"reservations">) => void;
  onCancel: (id: Id<"reservations">) => void;
  onMarkNoShow: (id: Id<"reservations">) => void;
  onFreeTable: (id: Id<"reservations">) => void;
  onEdit?: (id: Id<"reservations">) => void;
  onDelete?: (id: Id<"reservations">) => void;
}

function parsePartySize(extraData?: string): number | null {
  if (!extraData) return null;
  try {
    const d = JSON.parse(extraData) as { partySize?: number; people?: number };
    return d.partySize ?? d.people ?? null;
  } catch {
    return null;
  }
}

function resolvePartySize(numberOfPeople?: number, extraData?: string): number | null {
  return numberOfPeople ?? parsePartySize(extraData);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSource(source?: string) {
  if (source === "virtual") return "WhatsApp";
  if (source === "presencial") return "Manual / Web";
  return source ?? "-";
}

export function ReservationDialog({
  reservation,
  open,
  onOpenChange,
  primaryColor,
  onConfirm,
  onCancel,
  onMarkNoShow,
  onFreeTable,
  onEdit,
  onDelete,
}: ReservationDialogProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  if (!reservation) return null;

  const partySize = resolvePartySize(reservation.numberOfPeople, reservation.extraData);
  const canConfirm = reservation.status === "pending" || !reservation.status;
  const canCancel = reservation.status !== "cancelled" && reservation.status !== "no_show";
  const canMarkNoShow = reservation.status !== "cancelled" && reservation.status !== "no_show";
  const canFreeTable = reservation.status === "confirmed";

  const statusLabel =
    reservation.status === "confirmed"
      ? "Confirmada"
      : reservation.status === "pending"
        ? "Pendiente"
        : reservation.status === "cancelled"
          ? "Cancelada"
          : reservation.status === "no_show"
            ? "No se presentó"
            : reservation.status === "completed"
              ? "Completada"
              : "Confirmada";

  const handleAction = (fn: () => void) => {
    fn();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-slate-200 bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Detalle de reserva</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div>
            <span
              className={cn(
                "inline-flex rounded-full px-3 py-1 text-xs font-medium",
                reservation.status === "confirmed" && "bg-emerald-100 text-emerald-800",
                reservation.status === "pending" && "bg-amber-100 text-amber-800",
                reservation.status === "cancelled" && "bg-slate-100 text-slate-600",
                reservation.status === "no_show" && "bg-rose-100 text-rose-800",
                reservation.status === "completed" && "bg-slate-100 text-slate-600"
              )}
            >
              {statusLabel}
            </span>
          </div>

          <div>
            <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <User className="size-4 text-slate-500" />
              {reservation.customerName}
            </p>
            {reservation.customerPhone && (
              <a
                href={`tel:${reservation.customerPhone}`}
                className="mt-2 flex items-center gap-2 text-sm text-slate-700 hover:underline"
              >
                <Phone className="size-4 text-slate-500" />
                {reservation.customerPhone}
              </a>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="flex items-center gap-2 text-sm text-slate-700">
              <Calendar className="size-4 text-slate-500" />
              {formatTime(reservation.startTime)} – {formatTime(reservation.endTime)}
            </p>
            {reservation.tableNumber && (
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <MapPin className="size-4 text-slate-500" />
                Mesa {reservation.tableNumber}
              </p>
            )}
            {partySize != null && (
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <Users className="size-4 text-slate-500" />
                {partySize} personas
              </p>
            )}
            <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
              <FileText className="size-4" />
              Origen: {formatSource(reservation.source)}
            </p>
            {reservation.notes && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                📝 {reservation.notes}
              </p>
            )}
          </div>

          {/* Acciones rápidas */}
          <div className="space-y-2 border-t border-slate-200 pt-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Acciones rápidas
            </p>
            <div className="flex flex-wrap gap-2">
              {canConfirm && (
                <button
                  type="button"
                  onClick={() => handleAction(() => onConfirm(reservation._id))}
                  className="flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-200"
                >
                  <CheckCircle2 className="size-4" /> Confirmar
                </button>
              )}
              {canFreeTable && (
                <button
                  type="button"
                  onClick={() => handleAction(() => onFreeTable(reservation._id))}
                  className="flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-200"
                >
                  <RefreshCw className="size-4" /> Liberar mesa
                </button>
              )}
              {canMarkNoShow && (
                <button
                  type="button"
                  onClick={() => handleAction(() => onMarkNoShow(reservation._id))}
                  className="flex items-center gap-2 rounded-lg bg-rose-100 px-3 py-2 text-sm font-medium text-rose-800 transition hover:bg-rose-200"
                >
                  <AlertCircle className="size-4" /> No se presentó
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  onClick={() => handleAction(() => onCancel(reservation._id))}
                  className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                >
                  <XCircle className="size-4" /> Cancelar
                </button>
              )}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => handleAction(() => onEdit(reservation._id))}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Edit className="size-4" /> Editar
                </button>
              )}
              {onDelete && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
                  >
                    <Trash2 className="size-4" /> Eliminar
                  </button>
                  <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar esta reserva?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminará permanentemente la reserva de {reservation.customerName}.
                          {reservation.googleEventId && (
                            <> También se eliminará del calendario de Google Calendar.</>
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleAction(() => onDelete(reservation._id))}
                          className="bg-rose-600 hover:bg-rose-700"
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
