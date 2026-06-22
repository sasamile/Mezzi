import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const ROLES = ["OWNER", "ADMIN", "AGENT", "VIEWER", "HR"] as const;
const MODULES = [
  "Restaurantes",
  "Planes",
  "Administradores",
  "Inbox",
  "Conocimiento",
  "Prompts",
  "YCloud",
  "Usuarios",
] as const;

const roleValidator = v.union(
  v.literal("OWNER"),
  v.literal("ADMIN"),
  v.literal("AGENT"),
  v.literal("VIEWER"),
  v.literal("HR")
);

/** Obtener todos los permisos por rol (como mapa) */
export const getMap = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("rolePermissions").collect();
    const map: Record<string, Record<string, boolean>> = {};
    for (const r of ROLES) map[r] = {};
    for (const m of MODULES) {
      for (const r of ROLES) map[r][m] = false;
    }
    for (const row of rows) {
      if (row.role in map && row.module in map[row.role]) {
        map[row.role][row.module] = row.allowed;
      }
    }
    return map;
  },
});

/** Establecer un permiso */
export const set = mutation({
  args: {
    role: roleValidator,
    module: v.string(),
    allowed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rolePermissions")
      .withIndex("by_role", (q) => q.eq("role", args.role))
      .collect();
    const row = existing.find((r) => r.module === args.module);
    if (row) {
      await ctx.db.patch(row._id, { allowed: args.allowed });
    } else {
      await ctx.db.insert("rolePermissions", {
        role: args.role,
        module: args.module,
        allowed: args.allowed,
      });
    }
  },
});

/** Inicializar permisos por defecto si no existen */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("rolePermissions").first();
    if (existing) return "Ya existen permisos";

    const defaults: Record<string, Record<string, boolean>> = {
      OWNER: MODULES.reduce((acc, m) => ({ ...acc, [m]: true }), {}),
      ADMIN: {
        Restaurantes: false,
        Planes: false,
        Administradores: true,
        Inbox: true,
        Conocimiento: true,
        Prompts: true,
        YCloud: true,
        Usuarios: true,
      },
      AGENT: {
        Restaurantes: false,
        Planes: false,
        Administradores: false,
        Inbox: true,
        Conocimiento: true,
        Prompts: false,
        YCloud: false,
        Usuarios: false,
      },
      VIEWER: {
        Restaurantes: false,
        Planes: false,
        Administradores: false,
        Inbox: true,
        Conocimiento: true,
        Prompts: true,
        YCloud: true,
        Usuarios: false,
      },
      HR: {
        Restaurantes: false,
        Planes: false,
        Administradores: false,
        Inbox: false,
        Conocimiento: false,
        Prompts: false,
        YCloud: false,
        Usuarios: false,
      },
    };

    for (const role of ROLES) {
      for (const [module, allowed] of Object.entries(defaults[role])) {
        await ctx.db.insert("rolePermissions", { role, module, allowed });
      }
    }
    return "Permisos inicializados";
  },
});
