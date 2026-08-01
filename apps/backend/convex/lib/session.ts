import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** Duración de una sesión. Pasado este tiempo hay que volver a iniciar sesión. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

/**
 * Token opaco de 32 bytes. No codifica nada del usuario: quien lo tenga no
 * puede deducir de él ningún dato, y quien no lo tenga no puede construirlo.
 */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Resuelve la sesión a partir del token. Devuelve null si no existe o expiró.
 *
 * No borra las sesiones vencidas: esto se llama también desde queries, que no
 * pueden escribir. La limpieza la hace `auth.logout` y, si hace falta, un cron.
 */
export async function getSession(
  ctx: Ctx,
  token: string
): Promise<Doc<"sessions"> | null> {
  if (!token) return null;

  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (!session) return null;
  if (session.expiresAt < Date.now()) return null;

  return session;
}

/**
 * Usuario autenticado, o null. Úsala solo cuando la ausencia de sesión sea un
 * caso válido (por ejemplo `auth.me`). Para todo lo demás, `requireUser`.
 */
export async function getUser(
  ctx: Ctx,
  token: string
): Promise<Doc<"users"> | null> {
  const session = await getSession(ctx, token);
  if (!session) return null;
  return await ctx.db.get(session.userId);
}

/** Usuario autenticado. Lanza si el token no es válido. */
export async function requireUser(
  ctx: Ctx,
  token: string
): Promise<Doc<"users">> {
  const user = await getUser(ctx, token);
  if (!user) {
    throw new ConvexError("Sesión inválida o expirada. Vuelve a iniciar sesión.");
  }
  return user;
}

/** Usuario autenticado que además es superadmin. */
export async function requireSuperadmin(
  ctx: Ctx,
  token: string
): Promise<Doc<"users">> {
  const user = await requireUser(ctx, token);
  if (!user.isSuperadmin) {
    throw new ConvexError("Solo un superadmin puede realizar esta acción");
  }
  return user;
}

/**
 * Usuario autenticado con acceso al restaurante indicado, en cualquier rol.
 * Un superadmin pasa siempre, y su `membership` es null.
 */
export async function requireTenantMember(
  ctx: Ctx,
  token: string,
  tenantId: Id<"tenants">
): Promise<{ user: Doc<"users">; membership: Doc<"userTenants"> | null }> {
  const user = await requireUser(ctx, token);
  if (user.isSuperadmin) return { user, membership: null };

  const membership = await ctx.db
    .query("userTenants")
    .withIndex("by_user_tenant", (q) =>
      q.eq("userId", user._id).eq("tenantId", tenantId)
    )
    .unique();

  if (!membership) {
    throw new ConvexError("No tienes acceso a este restaurante");
  }
  return { user, membership };
}

/** Usuario autenticado que es OWNER del restaurante (o superadmin). */
export async function requireTenantOwner(
  ctx: Ctx,
  token: string,
  tenantId: Id<"tenants">
): Promise<{ user: Doc<"users">; membership: Doc<"userTenants"> | null }> {
  const { user, membership } = await requireTenantMember(ctx, token, tenantId);
  if (user.isSuperadmin) return { user, membership };

  if (membership?.role !== "OWNER") {
    throw new ConvexError(
      "Solo el propietario del restaurante puede realizar esta acción"
    );
  }
  return { user, membership };
}

/**
 * Acceso a una conversación concreta. Muchas funciones reciben `conversationId`
 * y no `tenantId`: hay que cargar la conversación para saber a qué restaurante
 * pertenece y validar la pertenencia contra ese tenant, no contra uno que el
 * cliente indique.
 */
export async function requireConversationAccess(
  ctx: Ctx,
  token: string,
  conversationId: Id<"conversations">
): Promise<{
  user: Doc<"users">;
  conversation: Doc<"conversations">;
  membership: Doc<"userTenants"> | null;
}> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) throw new ConvexError("Conversación no encontrada");

  const { user, membership } = await requireTenantMember(
    ctx,
    token,
    conversation.tenantId
  );
  return { user, conversation, membership };
}

/**
 * Como `requireTenantMember`, pero partiendo de una membresía concreta.
 * Devuelve además el tenantId, que suele hacer falta después.
 */
export async function requireTenantOwnerByMembership(
  ctx: Ctx,
  token: string,
  userTenantId: Id<"userTenants">
): Promise<{ user: Doc<"users">; tenantId: Id<"tenants"> }> {
  const target = await ctx.db.get(userTenantId);
  if (!target) throw new ConvexError("Membresía no encontrada");

  const { user } = await requireTenantOwner(ctx, token, target.tenantId);
  return { user, tenantId: target.tenantId };
}
