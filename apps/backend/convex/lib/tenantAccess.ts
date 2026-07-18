import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/**
 * Solo el OWNER del tenant (o un superadmin) puede gestionar
 * usuarios, integraciones y datos del restaurante.
 */
export async function assertTenantOwner(
  ctx: Ctx,
  tenantId: Id<"tenants">,
  actorUserId: Id<"users">
): Promise<void> {
  const actor = await ctx.db.get(actorUserId);
  if (!actor) throw new Error("Usuario no encontrado");
  if (actor.isSuperadmin) return;

  const membership = await ctx.db
    .query("userTenants")
    .withIndex("by_user_tenant", (q) =>
      q.eq("userId", actorUserId).eq("tenantId", tenantId)
    )
    .unique();

  if (!membership || membership.role !== "OWNER") {
    throw new Error(
      "Solo el propietario del restaurante puede realizar esta acción"
    );
  }
}

export async function assertTenantOwnerByMembership(
  ctx: Ctx,
  userTenantId: Id<"userTenants">,
  actorUserId: Id<"users">
): Promise<Id<"tenants">> {
  const membership = await ctx.db.get(userTenantId);
  if (!membership) throw new Error("Membresía no encontrada");
  await assertTenantOwner(ctx, membership.tenantId, actorUserId);
  return membership.tenantId;
}

export async function assertSuperadmin(
  ctx: Ctx,
  actorUserId: Id<"users">
): Promise<void> {
  const actor = await ctx.db.get(actorUserId);
  if (!actor?.isSuperadmin) {
    throw new Error("Solo un superadmin puede realizar esta acción");
  }
}
