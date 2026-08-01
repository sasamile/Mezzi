import { jsonSchema } from "ai";
import { createTool } from "@convex-dev/agent";
import { api, internal } from "../../../_generated/api";

export const setPriority = createTool({
  description:
    "Establecer prioridad de la conversación (high o urgent). Úsala cuando escales a humano para que aparezca arriba en la lista.",
  args: jsonSchema<{
    priority: "high" | "urgent";
  }>({
    type: "object",
    properties: {
      priority: {
        type: "string",
        enum: ["high", "urgent"],
        description: "high = necesita atención pronto, urgent = urgente",
      },
    },
    required: ["priority"],
    additionalProperties: false,
  }),
  handler: async (ctx, args) => {
    if (!ctx.threadId) {
      return "Falta el ID del hilo";
    }

    const conv = await ctx.runQuery(
      internal.system.conversations.getByThreadId,
      { threadId: ctx.threadId }
    );
    if (!conv) return "Conversación no encontrada";

    await ctx.runMutation(internal.conversations.updatePriorityInternal, {
      conversationId: conv._id,
      priority: args.priority,
    });

    return `Prioridad establecida en ${args.priority}`;
  },
});
