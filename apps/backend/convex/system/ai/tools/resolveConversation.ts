import { jsonSchema } from "ai";
import { createTool } from "@convex-dev/agent";
import { api, internal } from "../../../_generated/api";
import { supportAgent } from "../agents/supportAgent";
import {
  isEmailOnlySupportTenant,
  PQR_REGISTERED_ACK_MESSAGE,
} from "../../alcarbon";

export const escalateConversation = createTool({
  description: "Conectar al cliente con un agente humano del restaurante",
  args: jsonSchema<Record<string, never>>({
    type: "object",
    properties: {},
    additionalProperties: false,
  }),
  handler: async (ctx) => {
    if (!ctx.threadId) {
      return "Falta el ID del hilo";
    }

    const conversation = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      { threadId: ctx.threadId }
    );
    if (conversation) {
      const tenant = await ctx.runQuery(api.tenants.get, {
        tenantId: conversation.tenantId,
      });
      if (isEmailOnlySupportTenant(tenant)) {
        return (
          "NO uses escalamiento en vivo para este restaurante. " +
          "Registra la PQR con createPQRTool si aún no está registrada. " +
          `Mensaje al cliente: "${PQR_REGISTERED_ACK_MESSAGE}"`
        );
      }
    }

    await ctx.runMutation(internal.system.conversations.escalate, {
      threadId: ctx.threadId,
    });

    await supportAgent.saveMessage(ctx, {
      threadId: ctx.threadId,
      message: {
        role: "assistant",
        content:
          "He escalado tu consulta a un agente del restaurante. Te contactarán pronto. ¡Gracias por tu paciencia! 🚀",
      },
    });

    return "Conversación escalada";
  },
});

export const resolveConversation = createTool({
  description: "Marcar la conversación como resuelta",
  args: jsonSchema<Record<string, never>>({
    type: "object",
    properties: {},
    additionalProperties: false,
  }),
  handler: async (ctx) => {
    if (!ctx.threadId) {
      return "Falta el ID del hilo";
    }

    await ctx.runMutation(internal.system.conversations.resolve, {
      threadId: ctx.threadId,
    });

    await supportAgent.saveMessage(ctx, {
      threadId: ctx.threadId,
      message: {
        role: "assistant",
        content:
          "He marcado esta conversación como resuelta. Si necesitas algo más, estaremos aquí. ¡Que tengas un excelente día! ✨",
      },
    });

    return "Conversación resuelta";
  },
});
