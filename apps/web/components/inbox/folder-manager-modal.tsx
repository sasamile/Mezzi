"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex";
import type { Id } from "@/convex";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sileo } from "@/lib/toast";
import { Plus, Trash2, Save } from "lucide-react";
import {
  FOLDER_COLOR_PALETTE,
  DEFAULT_FOLDER_COLOR,
  folderIcon,
} from "@/lib/inbox-folders";

interface FolderDoc {
  _id: string;
  name: string;
  color?: string;
  icon?: string;
  keywords?: string[];
}

interface FolderManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: Id<"tenants">;
  folders: FolderDoc[];
  primaryColor: string;
}

function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FOLDER_COLOR_PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "size-5 rounded-full ring-offset-1 transition",
            value === c && "ring-2 ring-slate-400"
          )}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function FolderRow({
  folder,
  primaryColor,
}: {
  folder: FolderDoc;
  primaryColor: string;
}) {
  const update = useMutation(api.conversationFolders.update);
  const remove = useMutation(api.conversationFolders.remove);
  const [name, setName] = React.useState(folder.name);
  const [color, setColor] = React.useState(folder.color ?? DEFAULT_FOLDER_COLOR);
  const [keywords, setKeywords] = React.useState(
    (folder.keywords ?? []).join(", ")
  );
  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const Icon = folderIcon(folder.icon);

  const dirty =
    name.trim() !== folder.name ||
    color !== (folder.color ?? DEFAULT_FOLDER_COLOR) ||
    keywords !== (folder.keywords ?? []).join(", ");

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await update({
        folderId: folder._id as Id<"conversationFolders">,
        name: name.trim(),
        color,
        keywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
      });
      sileo.success({ title: "Carpeta actualizada" });
    } catch (e) {
      sileo.error({
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo guardar",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await remove({ folderId: folder._id as Id<"conversationFolders"> });
      sileo.success({ title: "Carpeta eliminada" });
    } catch (e) {
      sileo.error({
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo eliminar",
      });
    }
  };

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <Icon size={16} style={{ color }} className="shrink-0" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-slate-400"
          placeholder="Nombre de la carpeta"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          title="Guardar"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-white disabled:opacity-40"
          style={{ background: primaryColor }}
        >
          <Save size={14} />
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete((v) => !v)}
          title="Eliminar"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-red-600 transition-colors hover:bg-red-50"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-2.5 space-y-2">
        <ColorSwatches value={color} onChange={setColor} />
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Palabras clave (auto-clasificación, separadas por coma)
          </label>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="w-full rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-slate-400"
            placeholder="factura, facturación, cuenta de cobro"
          />
        </div>
      </div>
      {confirmDelete && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <span>¿Eliminar “{folder.name}”? Se quitará de sus chats.</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded px-2 py-1 font-medium hover:bg-red-100"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded bg-red-600 px-2 py-1 font-semibold text-white hover:bg-red-700"
            >
              Eliminar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FolderManagerModal({
  open,
  onOpenChange,
  tenantId,
  folders,
  primaryColor,
}: FolderManagerModalProps) {
  const create = useMutation(api.conversationFolders.create);
  const seedDefaults = useMutation(api.conversationFolders.seedDefaults);
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState(FOLDER_COLOR_PALETTE[0]);
  const [creating, setCreating] = React.useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await create({ tenantId, name: newName.trim(), color: newColor });
      setNewName("");
      sileo.success({ title: "Carpeta creada" });
    } catch (e) {
      sileo.error({
        title: "Error",
        description: e instanceof Error ? e.message : "No se pudo crear",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Carpetas del inbox</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Organiza los chats por carpetas y define palabras clave para
            clasificarlos automáticamente.
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto py-2">
          {folders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Aún no tienes carpetas.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => seedDefaults({ tenantId })}
              >
                Crear carpetas sugeridas
              </Button>
            </div>
          ) : (
            folders.map((f) => (
              <FolderRow key={f._id} folder={f} primaryColor={primaryColor} />
            ))
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            Nueva carpeta
          </p>
          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-slate-400"
              placeholder="Ej. Facturas"
            />
            <Button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              style={{ background: primaryColor }}
              className="shrink-0 text-white"
            >
              <Plus size={15} className="mr-1" />
              Añadir
            </Button>
          </div>
          <ColorSwatches value={newColor} onChange={setNewColor} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
