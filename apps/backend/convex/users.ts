import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const roleValidator = v.union(
  v.literal("OWNER"),
  v.literal("ADMIN"),
  v.literal("AGENT"),
  v.literal("VIEWER"),
  v.literal("HR")
);

/** Páginas por defecto para rol Talento Humano (solo vacantes). */
export const HR_DEFAULT_ALLOWED_PAGES = ["trabajaConNosotros"] as const;

/** Lista todos los usuarios (superadmin) - sin passwordHash */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").order("desc").collect();
    return users.map((u) => {
      const { passwordHash: _, ...safe } = u;
      return safe;
    });
  },
});

export const get = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const { passwordHash: _, ...safe } = user;
    return safe;
  },
});

/** Crear usuario para invitarlo como administrador de un restaurante */
export const create = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) throw new Error("Ya existe un usuario con ese email");

    const now = Date.now();
    let passwordHash: string | undefined;
    if (args.password) {
      const salt = new Uint8Array(16);
      if (typeof crypto !== "undefined" && crypto.getRandomValues)
        crypto.getRandomValues(salt);
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(args.password),
        "PBKDF2",
        false,
        ["deriveBits"]
      );
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
        key,
        256
      );
      const hashHex = Array.from(new Uint8Array(bits))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const saltHex = Array.from(salt)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      passwordHash = `${saltHex}:${hashHex}`;
    }
    return await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      passwordHash,
      isSuperadmin: false,
      createdAt: now,
    });
  },
});

export const listByTenant = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("userTenants")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    const result = await Promise.all(
      memberships.map(async (ut) => {
        const user = await ctx.db.get(ut.userId);
        return { ...ut, user: user ?? null };
      })
    );
    return result;
  },
});

export const inviteToTenant = mutation({
  args: {
    tenantId: v.id("tenants"),
    userId: v.id("users"),
    role: roleValidator,
    allowedPages: v.optional(v.array(v.string())),
    allowedFolders: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userTenants")
      .withIndex("by_user_tenant", (q) =>
        q.eq("userId", args.userId).eq("tenantId", args.tenantId)
      )
      .first();
    if (existing) throw new Error("El usuario ya tiene acceso a este restaurante");
    const now = Date.now();
    const allowedPages =
      args.allowedPages ??
      (args.role === "HR" ? [...HR_DEFAULT_ALLOWED_PAGES] : undefined);
    return await ctx.db.insert("userTenants", {
      userId: args.userId,
      tenantId: args.tenantId,
      role: args.role,
      allowedPages,
      allowedFolders: args.allowedFolders,
      createdAt: now,
    });
  },
});

/** Actualizar permisos (páginas visibles) de un usuario en el tenant */
export const updatePermissions = mutation({
  args: {
    userTenantId: v.id("userTenants"),
    allowedPages: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userTenantId, { allowedPages: args.allowedPages });
    return args.userTenantId;
  },
});

/**
 * Actualizar carpetas del inbox a las que tiene acceso un usuario en el tenant.
 * allowedFolders = undefined → todas; [] → ninguna. Incluye el sentinel
 * "__unclassified__" para conceder acceso a los chats sin clasificar.
 */
export const updateFolderPermissions = mutation({
  args: {
    userTenantId: v.id("userTenants"),
    allowedFolders: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userTenantId, {
      allowedFolders: args.allowedFolders,
    });
    return args.userTenantId;
  },
});

/** Obtener membership de un usuario en un tenant */
export const getMembershipByTenantAndUser = query({
  args: {
    tenantId: v.id("tenants"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userTenants")
      .withIndex("by_user_tenant", (q) =>
        q.eq("userId", args.userId).eq("tenantId", args.tenantId)
      )
      .unique();
  },
});

export const updateRole = mutation({
  args: {
    userTenantId: v.id("userTenants"),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userTenantId, { role: args.role });
    if (args.role === "HR") {
      await ctx.db.patch(args.userTenantId, {
        allowedPages: [...HR_DEFAULT_ALLOWED_PAGES],
      });
    }
    return args.userTenantId;
  },
});

/**
 * Actualiza datos del usuario (nombre, email, contraseña opcional)
 * desde el panel del restaurante.
 */
export const updateMemberProfile = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
    email: v.string(),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("Usuario no encontrado");

    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    if (!name) throw new Error("El nombre es obligatorio");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Email no válido");
    }

    if (email !== user.email.toLowerCase()) {
      const taken = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (taken && taken._id !== args.userId) {
        throw new Error("Ya existe un usuario con ese email");
      }
    }

    const patch: {
      name: string;
      email: string;
      passwordHash?: string;
    } = { name, email };

    if (args.password && args.password.length > 0) {
      if (args.password.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres");
      }
      const salt = new Uint8Array(16);
      if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        crypto.getRandomValues(salt);
      }
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        enc.encode(args.password),
        "PBKDF2",
        false,
        ["deriveBits"]
      );
      const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
        key,
        256
      );
      const hashHex = Array.from(new Uint8Array(bits))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const saltHex = Array.from(salt)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      patch.passwordHash = `${saltHex}:${hashHex}`;
    }

    await ctx.db.patch(args.userId, patch);
    return args.userId;
  },
});

export const removeFromTenant = mutation({
  args: { userTenantId: v.id("userTenants") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.userTenantId);
    return args.userTenantId;
  },
});

export const getTenantsForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("userTenants")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const tenants = await Promise.all(
      memberships.map((ut) => ctx.db.get(ut.tenantId))
    );
    return memberships.map((ut, i) => ({ ...ut, tenant: tenants[i] ?? null }));
  },
});
