import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Descarga media remota (p. ej. link temporal de YCloud) y la guarda en Convex Storage.
 * Las URLs de YCloud (`docs.ycloud.com`) caducan; sin esto el inbox deja de mostrar fotos/PDFs.
 */
export async function persistRemoteMediaToConvex(
  ctx: ActionCtx,
  remoteUrl: string
): Promise<string | undefined> {
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) {
      console.warn(
        "persistRemoteMediaToConvex: download failed",
        res.status,
        remoteUrl.slice(0, 80)
      );
      return undefined;
    }
    const blob = await res.blob();
    if (blob.size === 0) {
      console.warn("persistRemoteMediaToConvex: empty blob");
      return undefined;
    }
    const storageId: Id<"_storage"> = await ctx.storage.store(blob);
    const url = await ctx.storage.getUrl(storageId);
    return url ?? undefined;
  } catch (err) {
    console.warn(
      "persistRemoteMediaToConvex: error",
      err instanceof Error ? err.message : err
    );
    return undefined;
  }
}

/** True si la URL parece un link temporal de YCloud/WhatsApp (caduca). */
export function isEphemeralYCloudMediaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes("ycloud.com") ||
      host.includes("whatsapp.net") ||
      host.includes("fbcdn.net")
    );
  } catch {
    return false;
  }
}
