import { mutation } from "./_generated/server";
import {
  URBRANDS_DOMAIN,
  normalizeHost,
} from "./system/urbrands";
import { URBRANDS_DANNA_PROMPT } from "./system/ai/urbrandsPrompts";

const URBRANDS_PROMPT_NAME = "Danna - URBRANDS";

/**
 * Carga (o actualiza) el prompt por defecto "Danna" del tenant URBRANDS.
 * Idempotente: si ya existe un prompt default, lo reemplaza por la versión actual.
 *
 * Requiere que el tenant URBRANDS exista primero (`bun run seed:urbrands`).
 * Ejecutar: `bun run seed:urbrands:prompt` en apps/backend.
 */
export const seedUrbrandsPrompt = mutation({
  args: {},
  handler: async (ctx) => {
    const tenants = await ctx.db.query("tenants").collect();
    const tenant = tenants.find(
      (t) => normalizeHost(t.customDomain) === URBRANDS_DOMAIN
    );
    if (!tenant) {
      throw new Error(
        "Tenant URBRANDS no existe. Ejecuta primero `bun run seed:urbrands`."
      );
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("tenantPrompts")
      .withIndex("by_tenant_default", (q) =>
        q.eq("tenantId", tenant._id).eq("isDefault", true)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: URBRANDS_PROMPT_NAME,
        prompt: URBRANDS_DANNA_PROMPT,
        updatedAt: now,
      });
      return { tenantId: tenant._id, promptId: existing._id, updated: true };
    }

    const promptId = await ctx.db.insert("tenantPrompts", {
      tenantId: tenant._id,
      name: URBRANDS_PROMPT_NAME,
      prompt: URBRANDS_DANNA_PROMPT,
      isDefault: true,
      updatedAt: now,
    });
    return { tenantId: tenant._id, promptId, created: true };
  },
});
