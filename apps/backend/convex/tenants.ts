import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function normalizeHost(value?: string): string | null {
  if (!value) return null;
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(":")[0] || null;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tenants").order("desc").collect();
  },
});

export const listWithPlans = query({
  args: {},
  handler: async (ctx) => {
    const tenants = await ctx.db.query("tenants").order("desc").collect();
    return Promise.all(
      tenants.map(async (t) => {
        const plan = t.planId ? await ctx.db.get(t.planId) : null;
        return { ...t, planName: plan?.name ?? null };
      })
    );
  },
});

export const get = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tenantId);
  },
});

export const generateLogoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getStorageUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("trial"),
      v.literal("cancelled")
    ),
    planId: v.optional(v.id("plans")),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    customDomain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("tenants", {
      name: args.name,
      status: args.status,
      planId: args.planId,
      primaryColor: args.primaryColor,
      secondaryColor: args.secondaryColor,
      logoUrl: args.logoUrl,
      address: args.address,
      phone: args.phone,
      customDomain: normalizeHost(args.customDomain) ?? undefined,
      createdAt: now,
    });
  },
});

const enabledModulesValidator = v.optional(
  v.object({
    pqr: v.optional(v.boolean()),
    pedidos: v.optional(v.boolean()),
    reservas: v.optional(v.boolean()),
    conocimiento: v.optional(v.boolean()),
    trabajaConNosotros: v.optional(v.boolean()),
  })
);

export const update = mutation({
  args: {
    tenantId: v.id("tenants"),
    name: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("trial"),
        v.literal("cancelled")
      )
    ),
    planId: v.optional(v.id("plans")),
    primaryColor: v.optional(v.string()),
    secondaryColor: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    customDomain: v.optional(v.string()),
    pqrNotificationEmails: v.optional(v.array(v.string())),
    enabledModules: enabledModulesValidator,
  },
  handler: async (ctx, args) => {
    const { tenantId, logoStorageId, ...rest } = args;
    const updates: Record<string, unknown> = { ...rest };
    if (logoStorageId) {
      const url = await ctx.storage.getUrl(logoStorageId);
      if (url) updates.logoUrl = url;
    }
    if (args.customDomain !== undefined) {
      updates.customDomain = normalizeHost(args.customDomain) ?? undefined;
    }
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await ctx.db.patch(tenantId, filtered);
    return tenantId;
  },
});

export const getByHost = query({
  args: { host: v.string() },
  handler: async (ctx, args) => {
    const host = normalizeHost(args.host);
    if (!host) return null;
    const tenants = await ctx.db.query("tenants").collect();
    return tenants.find((tenant) => normalizeHost(tenant.customDomain) === host) ?? null;
  },
});

export const remove = mutation({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    // Eliminar memberships, integraciones, etc. asociados
    const memberships = await ctx.db
      .query("userTenants")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    for (const m of memberships) await ctx.db.delete(m._id);

    const integrations = await ctx.db
      .query("tenantIntegrations")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    for (const i of integrations) await ctx.db.delete(i._id);

    await ctx.db.delete(args.tenantId);
    return args.tenantId;
  },
});

export const updateStatus = mutation({
  args: {
    tenantId: v.id("tenants"),
    status: v.union(
      v.literal("active"),
      v.literal("trial"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tenantId, { status: args.status });
    return args.tenantId;
  },
});

/**
 * Crea datos de demo: 1 usuario superadmin, 2 restaurantes, membresías e integración YCloud.
 * Ejecutar una vez desde el dashboard de Convex (Functions → tenants.seedDemo → Run).
 */
export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const userId = await ctx.db.insert("users", {
      name: "Superadmin Demo",
      email: "superadmin@demo.com",
      isSuperadmin: true,
      createdAt: now,
    });

    const t1 = await ctx.db.insert("tenants", {
      name: "Restaurante La Parrilla",
      status: "active",
      createdAt: now,
    });
    const t2 = await ctx.db.insert("tenants", {
      name: "Pizzería Napoli",
      status: "trial",
      createdAt: now,
    });

    await ctx.db.insert("userTenants", {
      userId,
      tenantId: t1,
      role: "OWNER",
      createdAt: now,
    });
    await ctx.db.insert("userTenants", {
      userId,
      tenantId: t2,
      role: "OWNER",
      createdAt: now,
    });

    await ctx.db.insert("tenantIntegrations", {
      tenantId: t1,
      provider: "YCLOUD",
      webhookPath: `tenant_${t1}_${now.toString(36)}`,
      connected: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("tenantIntegrations", {
      tenantId: t2,
      provider: "YCLOUD",
      webhookPath: `tenant_${t2}_${now.toString(36)}`,
      connected: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("knowledgeItems", {
      tenantId: t1,
      title: "Horario de atención",
      content:
        "Lunes a viernes de 12:00 a 22:00. Sábados y domingos de 13:00 a 23:00.",
      tags: ["horarios"],
      updatedAt: now,
    });
    await ctx.db.insert("tenantPrompts", {
      tenantId: t1,
      name: "Prompt base restaurante",
      prompt:
        "Eres el asistente virtual del restaurante La Parrilla. Respondes en tono cercano y profesional. Prioriza reservas y resolución de dudas frecuentes sobre horario, menú y ubicación.",
      isDefault: true,
      updatedAt: now,
    });

    return { userId, tenants: [t1, t2] };
  },
});

const URBRANDS_DOMAIN = "urbrands.mezzi.app";

/**
 * Crea el tenant UR Brands con dominio dedicado (idempotente).
 * Ejecutar: `bun run seed:urbrands` en apps/backend
 */
export const seedUrbrands = mutation({
  args: {},
  handler: async (ctx) => {
    const tenants = await ctx.db.query("tenants").collect();
    const existing = tenants.find(
      (t) => normalizeHost(t.customDomain) === URBRANDS_DOMAIN
    );
    if (existing) {
      return { tenantId: existing._id, created: false };
    }

    const now = Date.now();
    const tenantId = await ctx.db.insert("tenants", {
      name: "UR Brands",
      status: "active",
      customDomain: URBRANDS_DOMAIN,
      logoUrl: "/logos/urbrands.png",
      primaryColor: "#171717",
      secondaryColor: "#64748b",
      createdAt: now,
    });

    return { tenantId, created: true };
  },
});

// ─── PQR Email Routing ────────────────────────────────────────────────────────

/**
 * Configura (o reemplaza) el routing de emails de PQR para un tenant.
 *
 * Cada regla define: módulo + ciudad opcional → correos destino (to) + copia (cc).
 * Las reglas se evalúan en orden; la primera que coincida gana.
 *
 * Ejemplo de uso desde el panel superadmin (o Convex dashboard):
 * ```
 * await setPqrEmailRouting({
 *   tenantId: "<id>",
 *   routing: AL_CARBON_PQR_ROUTING,
 * })
 * ```
 */
export const setPqrEmailRouting = mutation({
  args: {
    tenantId: v.id("tenants"),
    routing: v.array(
      v.object({
        module: v.string(),
        cityMatch: v.optional(v.string()),
        to: v.array(v.string()),
        cc: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant) throw new Error("Tenant no encontrado");
    await ctx.db.patch(args.tenantId, { pqrEmailRouting: args.routing });
    return args.tenantId;
  },
});

/**
 * Reglas de routing de PQR para Al Carbon.
 * Puede usarse directamente en el Convex dashboard:
 *
 *   mutation: tenants.setPqrEmailRouting
 *   args: { tenantId: "<id_alcarbon>", routing: AL_CARBON_PQR_ROUTING }
 *
 * Módulos que el bot debe enviar en el campo `module` de la PQR:
 *   calidad_alimentos | limpieza | facturacion | domicilios | sugerencias
 *   infraestructura | trabaja_nosotros | proveedores
 */
export const AL_CARBON_PQR_ROUTING = [
  // 🍔 Calidad de Alimentos y Bebidas
  { module: "calidad_alimentos",  to: ["servicioalcliente@alcarbonasados.com"] },
  // ✨ Limpieza e Higiene
  { module: "limpieza",           to: ["servicioalcliente@alcarbonasados.com"] },
  // 💳 Facturación y Pagos
  { module: "facturacion",        to: ["administrativa@alcarbonasados.com"] },
  // 🛵 Domicilios
  { module: "domicilios",         to: ["servicioalcliente@alcarbonasados.com"] },
  // 💡 Sugerencias y Felicitaciones
  { module: "sugerencias",        to: ["servicioalcliente@alcarbonasados.com"] },
  // 🛋️ Infraestructura
  { module: "infraestructura",    to: ["servicioalcliente@alcarbonasados.com"] },
  // 🧑‍💼 Trabaja con Nosotros — Medellín (evaluado primero)
  {
    module: "trabaja_nosotros",
    cityMatch: "medellin",
    to:  ["auxrecursohumano@alcarbonasados.com"],
    cc:  ["recursohumano@alcarbonasados.com"],
  },
  // 🧑‍💼 Trabaja con Nosotros — Bogotá, Rionegro, Barranquilla, Apartado, Villavicencio (y cualquier otra ciudad)
  {
    module: "trabaja_nosotros",
    to:  ["auxrecursohumano2@alcarbonasados.com"],
    cc:  ["recursohumano@alcarbonasados.com"],
  },
  // 🏭 PQRS Proveedores
  { module: "proveedores",        to: ["compras@alcarbonasados.com"] },
] as const;
