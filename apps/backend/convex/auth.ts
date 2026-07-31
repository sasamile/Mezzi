import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { assertSuperadmin } from "./lib/tenantAccess";

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

function randomSalt(): Uint8Array {
  const arr = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 16; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return arr;
}

function uint8ToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const saltBuffer = new ArrayBuffer(salt.length);
  new Uint8Array(saltBuffer).set(salt);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBuffer,
      iterations: 100_000,
    },
    key,
    256
  );
  return uint8ToHex(new Uint8Array(bits));
}

async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(
    saltHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  const derived = await hashPassword(password, salt);
  return derived === hashHex;
}

/**
 * Registra un usuario superadmin. Solo un superadmin puede invocarla.
 *
 * NOTA DE SEGURIDAD (medida interina): `actorUserId` viaja como argumento del
 * cliente, así que este guard es falsificable por quien ya conozca el _id de un
 * superadmin. Es un mitigante, no un control definitivo: se reemplaza en la
 * Fase 1 por `requireUser(token)` derivado de una sesión real en el servidor.
 * El primer superadmin se crea con `internal.auth.upsertSuperadmin` desde la CLI.
 */
export const registerSuperadmin = mutation({
  args: {
    actorUserId: v.id("users"),
    email: v.string(),
    password: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    await assertSuperadmin(ctx, args.actorUserId);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      throw new Error("Ya existe un usuario con ese email");
    }

    const salt = randomSalt();
    const derived = await hashPassword(args.password, salt);
    const passwordHash = `${uint8ToHex(salt)}:${derived}`;
    const now = Date.now();

    return await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      passwordHash,
      isSuperadmin: true,
      createdAt: now,
    });
  },
});

/**
 * Crea o actualiza un usuario superadmin. FUNCIÓN INTERNA: no es invocable desde
 * el cliente. Se ejecuta solo por CLI, que se autentica con una admin key:
 * `npx convex run auth:upsertSuperadmin '{"email":"...","password":"...","name":"..."}'`
 * Nunca escribas credenciales reales aquí ni en los scripts de package.json.
 */
export const upsertSuperadmin = internalMutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    const salt = randomSalt();
    const derived = await hashPassword(args.password, salt);
    const passwordHash = `${uint8ToHex(salt)}:${derived}`;
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        email: args.email,
        passwordHash,
        isSuperadmin: true,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      passwordHash,
      isSuperadmin: true,
      createdAt: now,
    });
  },
});

/**
 * Búsqueda de usuario por email. INTERNA: como query pública era un oráculo de
 * enumeración de cuentas (permitía confirmar qué emails existen en la plataforma).
 * No tenía ningún llamador en el frontend.
 */
export const getByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (!user) return null;
    const { passwordHash: _, ...safe } = user;
    return safe;
  },
});

/**
 * Login: valida email + password y devuelve el usuario (sin passwordHash).
 * Usar desde el front: auth.login({ email, password })
 */
export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    host: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user || !user.passwordHash) {
      throw new Error("Credenciales inválidas");
    }

    const valid = await verifyPassword(args.password, user.passwordHash);
    if (!valid) {
      throw new Error("Credenciales inválidas");
    }

    const host = normalizeHost(args.host);
    let forcedTenantId: string | undefined;
    if (host) {
      const scopedTenant = await ctx.db
        .query("tenants")
        .withIndex("by_custom_domain", (q) => q.eq("customDomain", host))
        .first();
      if (scopedTenant) {
        if (!user.isSuperadmin) {
          const membership = await ctx.db
            .query("userTenants")
            .withIndex("by_user_tenant", (q) =>
              q.eq("userId", user._id).eq("tenantId", scopedTenant._id)
            )
            .unique();
          if (!membership) {
            throw new Error("No tienes acceso a este dominio");
          }
        }
        forcedTenantId = scopedTenant._id;
      }
    }

    const { passwordHash: _, ...safe } = user;
    return { ...safe, forcedTenantId };
  },
});
