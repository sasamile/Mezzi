import {
  Folder,
  FileText,
  Truck,
  Users,
  ShoppingCart,
  Tag,
  Wrench,
  Utensils,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * Sentinel que representa el acceso a los chats "Sin clasificar" dentro de
 * userTenants.allowedFolders. Debe coincidir con conversationFolders.UNCLASSIFIED
 * en el backend.
 */
export const UNCLASSIFIED = "__unclassified__";

/** Íconos disponibles para las carpetas (por nombre lucide guardado en la carpeta). */
export const FOLDER_ICONS: Record<string, LucideIcon> = {
  Folder,
  FileText,
  Truck,
  Users,
  ShoppingCart,
  Tag,
  Wrench,
  Utensils,
  MessageCircle,
};

export const FOLDER_ICON_OPTIONS = Object.keys(FOLDER_ICONS);

export function folderIcon(name?: string | null): LucideIcon {
  if (name && FOLDER_ICONS[name]) return FOLDER_ICONS[name];
  return Folder;
}

export const DEFAULT_FOLDER_COLOR = "#64748b";

/** Paleta sugerida para el selector de color de carpeta. */
export const FOLDER_COLOR_PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#db2777",
  "#64748b",
];
