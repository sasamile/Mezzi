import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { supportAgent } from "./ai/agents/supportAgent";
import { saveMessage } from "@convex-dev/agent";
import { components } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

async function upsertCustomer(
  ctx: MutationCtx,
  tenantId: Id<"tenants">,
  externalContactId: string,
  customerName: string,
  now: number
) {
  const existing = await ctx.db
    .query("customers")
    .withIndex("by_tenant_contact", (q) =>
      q.eq("tenantId", tenantId).eq("externalContactId", externalContactId)
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      name: customerName.trim() || existing.name,
      lastContactAt: now,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.insert("customers", {
    tenantId,
    externalContactId,
    name: customerName.trim() || "Cliente",
    lastContactAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

/** Escalar conversación a agente humano (status = pending) */
export const escalate = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique();
    if (!conv) return;
    await ctx.db.patch(conv._id, { status: "pending", updatedAt: Date.now() });
  },
});

/** Resolver conversación (status = closed) */
export const resolve = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique();
    if (!conv) return;
    await ctx.db.patch(conv._id, { status: "closed", updatedAt: Date.now() });
  },
});

/** Reabrir conversación cerrada (cliente volvió a escribir) */
export const reopen = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique();
    if (!conv) return;
    await ctx.db.patch(conv._id, { status: "open", updatedAt: Date.now() });
  },
});

export const getByThreadId = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique();
  },
});

export const updateLastMessageAt = internalMutation({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const conv = await ctx.db
      .query("conversations")
      .withIndex("by_thread_id", (q) => q.eq("threadId", args.threadId))
      .unique();
    if (!conv) return;
    await ctx.db.patch(conv._id, {
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

const channelValidator = v.union(
  v.literal("whatsapp"),
  v.literal("messenger"),
  v.literal("webchat")
);

/**
 * Obtiene o crea conversación con threadId del agente.
 * Usado por processInboundMessage para asegurar que cada conversación tenga thread.
 */
export const getOrCreateForAgent = internalMutation({
  args: {
    tenantId: v.id("tenants"),
    externalContactId: v.string(),
    customerName: v.string(),
    channel: channelValidator,
  },
  handler: async (ctx, args): Promise<{ conversationId: Id<"conversations">; threadId: string }> => {
    const now = Date.now();

    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_tenant_contact", (q) =>
        q.eq("tenantId", args.tenantId).eq("externalContactId", args.externalContactId)
      )
      .first();

    if (existing) {
      // Conversación cerrada y cliente vuelve a escribir → thread nuevo para evitar
      // que el agente continúe el flujo anterior con contexto contaminado.
      if (existing.status === "closed" && existing.threadId) {
        const { threadId: newThreadId } = await supportAgent.createThread(ctx, {
          userId: args.tenantId,
        });
        await ctx.db.patch(existing._id, {
          threadId: newThreadId,
          status: "open",
          lastMessageAt: now,
          updatedAt: now,
          customerName: args.customerName,
        });
        await upsertCustomer(ctx, args.tenantId, args.externalContactId, args.customerName, now);
        return { conversationId: existing._id, threadId: newThreadId };
      }

      // Si ya tiene threadId (y no está cerrada), retornar el mismo
      if (existing.threadId) {
        await ctx.db.patch(existing._id, {
          lastMessageAt: now,
          updatedAt: now,
          customerName: args.customerName,
        });
        await upsertCustomer(ctx, args.tenantId, args.externalContactId, args.customerName, now);
        return { conversationId: existing._id, threadId: existing.threadId };
      }

      // Sin threadId aún → crear uno nuevo
      const { threadId } = await supportAgent.createThread(ctx, {
        userId: args.tenantId,
      });

      await ctx.db.patch(existing._id, {
        threadId,
        lastMessageAt: now,
        updatedAt: now,
        customerName: args.customerName,
        status: "open",
      });
      await upsertCustomer(ctx, args.tenantId, args.externalContactId, args.customerName, now);

      const greetMessage =
        "¡Hola! Soy el asistente virtual del restaurante. ¿En qué puedo ayudarte hoy? ✨";
      await saveMessage(ctx, components.agent, {
        threadId,
        message: { role: "assistant", content: greetMessage },
      });

      return { conversationId: existing._id, threadId };
    }

    // Nueva conversación
    const { threadId } = await supportAgent.createThread(ctx, {
      userId: args.tenantId,
    });

    const greetMessage =
      "¡Hola! Soy el asistente virtual del restaurante. ¿En qué puedo ayudarte hoy? ✨";
    await saveMessage(ctx, components.agent, {
      threadId,
      message: { role: "assistant", content: greetMessage },
    });

    const conversationId = await ctx.db.insert("conversations", {
      tenantId: args.tenantId,
      externalContactId: args.externalContactId,
      customerName: args.customerName,
      channel: args.channel,
      status: "open",
      threadId,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await upsertCustomer(ctx, args.tenantId, args.externalContactId, args.customerName, now);

    return { conversationId, threadId };
  },
});
