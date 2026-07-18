"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import { useTenant } from "@/lib/tenant-context";
import { useRequireModule } from "@/lib/use-require-module";
import { useRef, useState } from "react";
import {
  FileText,
  Trash2,
  CloudUpload,
  Loader2,
  ExternalLink,
  Pencil,
  Check,
  X,
  Plus,
} from "lucide-react";

type PdfDoc = {
  _id: Id<"tenantPdfs">;
  label: string;
  fileName: string;
  url: string | null;
  updatedAt: number;
};

function PdfRow({
  pdf,
  onDelete,
  onRename,
}: {
  pdf: PdfDoc;
  onDelete: (id: Id<"tenantPdfs">) => Promise<void>;
  onRename: (id: Id<"tenantPdfs">, label: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [labelValue, setLabelValue] = useState(pdf.label);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleRename = async () => {
    if (!labelValue.trim() || labelValue.trim() === pdf.label) {
      setEditing(false);
      setLabelValue(pdf.label);
      return;
    }
    setSaving(true);
    await onRename(pdf._id, labelValue.trim());
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-50">
        <FileText className="h-5 w-5 text-red-500" />
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") {
                  setEditing(false);
                  setLabelValue(pdf.label);
                }
              }}
              className="flex-1 rounded-lg border border-blue-300 px-2 py-1 text-sm font-medium text-foreground ring-1 ring-blue-400 outline-none"
            />
            <button
              onClick={handleRename}
              disabled={saving}
              className="rounded-lg p-1.5 text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              onClick={() => { setEditing(false); setLabelValue(pdf.label); }}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{pdf.label}</span>
            <button
              onClick={() => setEditing(true)}
              className="rounded p-0.5 text-slate-300 hover:text-muted-foreground transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <p className="truncate text-xs text-muted-foreground mt-0.5">{pdf.fileName}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {pdf.url && (
          <a
            href={pdf.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver
          </a>
        )}
        <button
          onClick={async () => { setDeleting(true); await onDelete(pdf._id); setDeleting(false); }}
          disabled={deleting}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Eliminar
        </button>
      </div>
    </div>
  );
}

export default function DocumentosPage() {
  useRequireModule("pdfs");
  const { tenantId } = useTenant();
  const pdfs = useQuery(api.pdfs.list, tenantId ? { tenantId } : "skip") as PdfDoc[] | undefined;
  const generateUploadUrl = useMutation(api.pdfs.generateUploadUrl);
  const savePdf = useMutation(api.pdfs.save);
  const removePdf = useMutation(api.pdfs.remove);
  const renamePdf = useMutation(api.pdfs.rename);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newLabel, setNewLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !tenantId) return;

    const label = newLabel.trim();
    if (!label) {
      setError("Escribe un nombre para el documento antes de subir.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.type !== "application/pdf") {
      setError("Solo se permiten archivos PDF.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("El archivo no puede superar 50 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Error al subir el archivo.");
      const { storageId } = (await res.json()) as { storageId: string };

      await savePdf({
        tenantId,
        label,
        storageId: storageId as never,
        fileName: file.name,
      });

      setSuccess(`"${label}" subido correctamente.`);
      setNewLabel("");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const handleDelete = async (id: Id<"tenantPdfs">) => {
    await removePdf({ pdfId: id });
  };

  const handleRename = async (id: Id<"tenantPdfs">, label: string) => {
    await renamePdf({ pdfId: id, label });
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Documentos PDF</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sube PDFs que el bot puede enviar por WhatsApp cuando el cliente los pida:
          menú, carta de decoraciones, promociones, etc.
        </p>
      </div>

      {/* Lista de PDFs */}
      {pdfs === undefined ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      ) : pdfs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-muted/40 px-6 py-10 text-center">
          <FileText className="mx-auto h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Sin documentos aún</p>
          <p className="text-xs text-muted-foreground mt-1">Agrega tu primer PDF abajo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pdfs.map((pdf) => (
            <PdfRow
              key={pdf._id}
              pdf={pdf}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </div>
      )}

      {/* Zona de carga */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-semibold text-foreground">Agregar nuevo documento</span>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Nombre del documento <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            placeholder='Ej: "Menú", "Decoraciones", "Promociones de octubre"'
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            disabled={uploading}
            className="w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground ring-1 ring-slate-900/5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <p className="text-xs text-muted-foreground">
            Este nombre es el que usa el bot para identificar y enviar el documento.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />

        <button
          onClick={() => {
            setError(null);
            if (!newLabel.trim()) {
              setError("Escribe un nombre antes de seleccionar el archivo.");
              return;
            }
            fileInputRef.current?.click();
          }}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-muted-foreground hover:border-blue-400 hover:bg-blue-50/30 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Subiendo...
            </>
          ) : (
            <>
              <CloudUpload className="h-4 w-4" />
              Seleccionar PDF · Máx. 50 MB
            </>
          )}
        </button>
      </div>

      {/* Mensajes */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          ✓ {success}
        </div>
      )}

      {/* Info */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-blue-700 space-y-1.5">
        <p className="font-medium">¿Cómo funciona?</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-600 text-xs">
          <li>El bot ve el nombre de cada PDF en el contexto de la conversación.</li>
          <li>Cuando el cliente pida algo que coincida, el bot envía el PDF automáticamente.</li>
          <li>
            Ejemplo: si subes un PDF llamado <strong>"Decoraciones"</strong>, cuando el
            cliente pregunte "¿qué opciones de decoración tienen?" el bot lo enviará.
          </li>
          <li>Puedes renombrar cualquier documento haciendo clic en el ícono del lápiz.</li>
        </ul>
      </div>
    </div>
  );
}
