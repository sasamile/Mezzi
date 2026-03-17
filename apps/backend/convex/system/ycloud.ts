import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { api } from "../_generated/api";
import { supportAgent } from "./ai/agents/supportAgent";
import { saveMessage } from "@convex-dev/agent";
import { components } from "../_generated/api";
import {
  escalateConversation,
  resolveConversation,
} from "./ai/tools/resolveConversation";
import { setPriority } from "./ai/tools/setPriority";
import { search } from "./ai/tools/search";
import { createReservation } from "./ai/tools/createReservation";
import { createPQR } from "./ai/tools/createPQR";
import { searchVacancies } from "./ai/tools/searchVacancies";
import { createOrder } from "./ai/tools/createOrder";
import { updateOrder } from "./ai/tools/updateOrder";
import { cancelOrder } from "./ai/tools/cancelOrder";
import { updateCustomerInfo } from "./ai/tools/updateCustomerInfo";
import type { PaginationResult } from "convex/server";
import type { MessageDoc } from "@convex-dev/agent";
import { Id } from "../_generated/dataModel";

/** Deduplicación: evita procesar el mismo webhook dos veces */
export const recordProcessedEvent = internalMutation({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("ycloudProcessedEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();
    if (existing) return { duplicate: true };
    await ctx.db.insert("ycloudProcessedEvents", { eventId: args.eventId });
    return { duplicate: false };
  },
});

/**
 * Procesa mensaje entrante de WhatsApp: guarda mensaje, ejecuta agente RAG
 * y envía la respuesta automáticamente por YCloud.
 */
export const processInboundMessage = internalAction({
  args: {
    tenantId: v.id("tenants"),
    eventId: v.string(),
    contactId: v.string(),
    customerName: v.string(),
    channel: v.union(
      v.literal("whatsapp"),
      v.literal("messenger"),
      v.literal("webchat")
    ),
    text: v.string(),
    mediaUrl: v.optional(v.string()),
    mediaType: v.optional(
      v.union(
        v.literal("image"),
        v.literal("video"),
        v.literal("audio"),
        v.literal("document")
      )
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    try {
      const dedupe = await ctx.runMutation(
        internal.system.ycloud.recordProcessedEvent,
        { eventId: args.eventId }
      );
      if (dedupe.duplicate) {
        console.log("YCloud: evento ya procesado (duplicado)", args.eventId);
        return;
      }

      const { conversationId, threadId } = await ctx.runMutation(
        internal.system.conversations.getOrCreateForAgent,
        {
          tenantId: args.tenantId,
          externalContactId: args.contactId,
          customerName: args.customerName,
          channel: args.channel,
        }
      );

      await ctx.runMutation(api.messages.add, {
        conversationId,
        tenantId: args.tenantId,
        direction: "INBOUND",
        content: args.text,
        mediaUrl: args.mediaUrl,
        mediaType: args.mediaType,
      });

      const conversation = await ctx.runQuery(
        internal.system.conversations.getByThreadId,
        { threadId }
      );

      if (!conversation) {
        console.error("YCloud: conversación no encontrada después de getOrCreate");
        return;
      }

      // assignedTo null/undefined = Bot activo; assignedTo set = Agente humano (bot no responde)
      const isBotMode = !conversation.assignedTo;

      // Reabrir si estaba cerrada, o si estaba "pending" sin humano asignado.
      // "pending" + sin humano asignado = punto muerto: el bot no responde y no hay humano.
      // En ese caso el bot retoma la conversación.
      const needsReopen =
        conversation.status === "closed" ||
        (conversation.status === "pending" && !conversation.assignedTo);
      if (needsReopen && isBotMode) {
        await ctx.runMutation(internal.system.conversations.reopen, {
          threadId,
        });
      }

      // Bot responde si: open, o si acabamos de reabrir (closed/pending-sin-humano)
      const shouldTriggerAgent =
        (conversation.status === "open" || needsReopen) && isBotMode;

      if (shouldTriggerAgent) {
        const tenant = await ctx.runQuery(api.tenants.get, {
          tenantId: args.tenantId,
        });
        const modules = tenant?.enabledModules ?? {};
        const hasReservas = modules.reservas !== false;
        const hasPedidos = modules.pedidos !== false;
        const hasPqr = modules.pqr !== false;
        const hasTrabajaConNosotros = modules.trabajaConNosotros !== false;

        const enabledList: string[] = [];
        if (hasReservas) enabledList.push("reservas");
        if (hasPedidos) enabledList.push("pedidos");
        if (hasPqr) enabledList.push("PQR (quejas/reclamos)");
        if (hasTrabajaConNosotros) enabledList.push("trabaja con nosotros");

        const modulesContext = enabledList.length > 0
          ? `[MÓDULOS HABILITADOS - OBLIGATORIO]
Este restaurante SOLO tiene habilitados: ${enabledList.join(", ")}. También puedes buscar en la base de conocimiento (menú, horarios, etc.).
NO ofrezcas NUNCA servicios que no estén en la lista.
${!hasReservas ? `- Si el cliente pide RESERVA y reservas NO está habilitado → responde: "Lo sentimos, este restaurante no ofrece reservas por WhatsApp. Te recomendamos contactar directamente al restaurante."` : "- Si el cliente quiere hacer una RESERVA y reservas está habilitado, puedes crearla usando createReservationTool cuando tengas los datos completos."}
${!hasPedidos ? `- Si el cliente pide PEDIDO y pedidos NO está habilitado → responde: "Lo sentimos, no tomamos pedidos por este canal. Te recomendamos contactar directamente al restaurante."` : "- Si el cliente quiere hacer un PEDIDO y pedidos está habilitado, toma el pedido normalmente y usa createOrderTool."}
${!hasPqr
    ? `- Si el cliente pide QUEJA/RECLAMO/PQR y PQR NO está habilitado → responde: "Lo sentimos, no podemos recibir quejas o reclamos por este canal. Te recomendamos contactar directamente al restaurante."`
    : "- Si el cliente quiere hacer una PQR (petición, queja o reclamo) y PQR está habilitado, SIEMPRE registra la PQR usando createPQRTool. NUNCA digas que no puedes recibir quejas o reclamos por este canal."}
${!hasTrabajaConNosotros
    ? `- Si el cliente pregunta por VACANTES/TRABAJO y trabaja con nosotros NO está habilitado → responde: "Lo sentimos, no tengo información de vacantes por este canal. Te recomendamos contactar directamente al restaurante."`
    : "- Si el cliente pregunta por vacantes o quiere trabajar: primero llama searchVacanciesTool para ver qué hay. Si quiere postularse y ya dio nombre, email, ciudad/sede y puesto → llama applyForJobTool."}

[Fin MÓDULOS HABILITADOS]\n\n`
          : "";

        const tenantPrompt = await ctx.runQuery(api.prompts.getDefault, {
          tenantId: args.tenantId,
        });
        const customer = await ctx.runQuery(api.customers.getByTenantAndContact, {
          tenantId: args.tenantId,
          externalContactId: args.contactId,
        });
        const customerContext =
          customer && (customer.notes || customer.email || customer.preferences)
            ? `[INFORMACIÓN DEL CLIENTE - usa esto para personalizar]
Nombre: ${customer.name}
${customer.email ? `Email: ${customer.email}` : ""}
${customer.notes ? `Notas: ${customer.notes}` : ""}
${customer.preferences ? `Preferencias: ${customer.preferences}` : ""}
[Fin INFORMACIÓN DEL CLIENTE]\n\n`
            : customer
              ? `[CLIENTE: ${customer.name}]\n\n`
              : "";

        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const timeHint = now.toTimeString().slice(0, 5);
        const dateTimeContext = `[Fecha y hora actual para interpretar "hoy" o "mañana": ${today}, aprox. ${timeHint}. Usa esta fecha cuando el cliente diga "hoy" o "para hoy.]\n\n`;
        // Transcribir audio con Whisper si aplica
        let resolvedText = args.text;
        if (args.mediaType === "audio" && args.mediaUrl) {
          try {
            const audioRes = await fetch(args.mediaUrl);
            if (audioRes.ok) {
              const audioBuffer = await audioRes.arrayBuffer();
              const formData = new FormData();
              formData.append(
                "file",
                new Blob([audioBuffer], { type: "audio/ogg" }),
                "audio.ogg"
              );
              formData.append("model", "whisper-1");
              formData.append("language", "es");
              const whisperRes = await fetch(
                "https://api.openai.com/v1/audio/transcriptions",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                  },
                  body: formData,
                }
              );
              if (whisperRes.ok) {
                const whisperData = (await whisperRes.json()) as {
                  text?: string;
                };
                if (whisperData.text?.trim()) {
                  resolvedText = `[AUDIO TRANSCRITO: "${whisperData.text.trim()}"]`;
                } else {
                  resolvedText = "[AUDIO SIN TRANSCRIPCIÓN]";
                }
              } else {
                resolvedText = "[AUDIO SIN TRANSCRIPCIÓN]";
              }
            } else {
              resolvedText = "[AUDIO SIN TRANSCRIPCIÓN]";
            }
          } catch (err) {
            console.warn("YCloud: transcripción de audio fallida", err);
            resolvedText = "[AUDIO SIN TRANSCRIPCIÓN]";
          }
        }

        // Contexto de imagen para prompt
        const imageContext =
          args.mediaType === "image" && args.mediaUrl
            ? `[IMAGEN RECIBIDA - el cliente envió una foto]\n`
            : "";

        // Recuperar el último mensaje OUTBOUND real del bot.
        // Usamos nuestra propia tabla `messages` (guardada en sendWhatsAppMessage)
        // porque listMessages() pagina desde el más antiguo y en conversaciones
        // largas el último mensaje real queda fuera de la primera página.
        let lastAssistantText = "";
        try {
          const lastOutbound = await ctx.runQuery(
            internal.messages.getLastOutboundMessage,
            { conversationId }
          );
          if (lastOutbound) lastAssistantText = lastOutbound;
        } catch {
          // continúa sin contexto adicional
        }

        // Pre-interpretar respuestas numéricas (1-5) para eliminar ambigüedad.
        // Si el último mensaje del asistente presentó una lista de opciones numeradas,
        // reemplazamos el número por su texto correspondiente antes de enviarlo a la IA.
        // Ej: "2" + último mensaje tenía "2️⃣ Anónimo" → se convierte en "2 (Anónimo)"
        function resolveNumericResponse(
          userText: string,
          lastMsg: string
        ): string {
          const trimmed = userText.trim();
          if (!/^[1-9]$/.test(trimmed)) return userText;
          const num = parseInt(trimmed, 10);
          const EMOJI_NUMS = [
            "1️⃣",
            "2️⃣",
            "3️⃣",
            "4️⃣",
            "5️⃣",
            "6️⃣",
            "7️⃣",
            "8️⃣",
            "9️⃣",
          ];
          const targetEmoji = EMOJI_NUMS[num - 1] ?? "";
          for (const line of lastMsg.split("\n")) {
            const clean = line.trim();
            // Formato emoji: "2️⃣ Anónimo"
            if (targetEmoji && clean.startsWith(targetEmoji)) {
              const optText = clean.slice(targetEmoji.length).trim();
              if (optText) return `${trimmed} (${optText})`;
            }
            // Formato texto: "2. Texto" o "2) Texto"
            const dotMatch = clean.match(
              new RegExp(`^${num}[.)\\s]\\s*(.+)`)
            );
            if (dotMatch?.[1]?.trim()) {
              return `${trimmed} (${dotMatch[1].trim()})`;
            }
          }
          return userText;
        }

        const clientText = lastAssistantText
          ? resolveNumericResponse(resolvedText, lastAssistantText)
          : resolvedText;

        const lastQuestionContext = lastAssistantText.trim()
          ? `[TU ÚLTIMO MENSAJE AL CLIENTE:]\n"${lastAssistantText.trim()}"\n[El cliente respondió a ese mensaje. Su intención ya está indicada en el texto anterior.]\n\n`
          : "";

        const promptWithContext =
          modulesContext +
          customerContext +
          dateTimeContext +
          imageContext +
          (tenantPrompt?.prompt?.trim()
            ? `[Contexto del restaurante:]\n${tenantPrompt.prompt}\n\n`
            : "") +
          lastQuestionContext +
          `[Cliente dice:]\n${clientText}`;

        const tools: Record<string, unknown> = {
          searchTool: search,
          updateCustomerInfoTool: updateCustomerInfo,
          escalateConversationTool: escalateConversation,
          setPriorityTool: setPriority,
          resolveConversationTool: resolveConversation,
        };
        if (hasReservas) tools.createReservationTool = createReservation;
        if (hasPedidos) {
          tools.createOrderTool = createOrder;
          tools.updateOrderTool = updateOrder;
          tools.cancelOrderTool = cancelOrder;
        }
        if (hasPqr) tools.createPQRTool = createPQR;
        if (hasTrabajaConNosotros) {
          tools.searchVacanciesTool = searchVacancies;
        }

        let agentResult: Awaited<ReturnType<typeof supportAgent.generateText>> | null = null;
        const isVisionMessage = args.mediaType === "image" && args.mediaUrl;
        try {
          if (isVisionMessage) {
            agentResult = await supportAgent.generateText(ctx, { threadId }, {
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: promptWithContext },
                    { type: "image", image: new URL(args.mediaUrl!) },
                  ],
                },
              ],
              tools: tools as Parameters<typeof supportAgent.generateText>[2]["tools"],
            });
          } else {
            agentResult = await supportAgent.generateText(ctx, { threadId }, {
              prompt: promptWithContext,
              tools: tools as Parameters<typeof supportAgent.generateText>[2]["tools"],
            });
          }
        } catch (agentErr) {
          console.error("YCloud: generateText falló", {
            tenantId: args.tenantId,
            error: agentErr instanceof Error ? agentErr.message : String(agentErr),
          });
          if (args.channel === "whatsapp") {
            try {
              await ctx.runAction(api.ycloud.sendWhatsAppMessage, {
                tenantId: args.tenantId,
                conversationId,
                content:
                  "Lo sentimos, estamos experimentando dificultades técnicas en este momento.\n\nPor favor intenta de nuevo en unos minutos o contacta directamente al restaurante. 🙏",
              });
            } catch { /* ignorar error de envío */ }
          }
          // No re-throw: el error ya fue manejado con el mensaje de fallback
          return;
        }

        if (args.channel === "whatsapp") {
          // Usar el texto devuelto directamente por el agente
          const directText = typeof agentResult?.text === "string" ? agentResult.text.trim() : "";

          if (directText) {
            await ctx.runAction(api.ycloud.sendWhatsAppMessage, {
              tenantId: args.tenantId,
              conversationId,
              content: directText,
            });
          } else {
            // Fallback: tools como resolveConversation guardan su propio mensaje en el hilo.
            // Si el agente no produjo texto final, enviamos el último mensaje guardado.
            await new Promise((r) => setTimeout(r, 500));
            const messagesAfter: PaginationResult<MessageDoc> =
              await supportAgent.listMessages(ctx, {
                threadId,
                paginationOpts: { numItems: 10, cursor: null },
              });

            const lastAssistantMessage = messagesAfter.page.find(
              (msg) => msg.message?.role === "assistant"
            );

            if (lastAssistantMessage?.message) {
              const messageContent = lastAssistantMessage.message.content;
              const messageText: string =
                typeof messageContent === "string"
                  ? messageContent
                  : Array.isArray(messageContent)
                    ? (messageContent as { type: string; text?: string }[])
                        .map((part) =>
                          part.type === "text" ? part.text ?? "" : ""
                        )
                        .join("")
                    : String(messageContent);

              if (messageText.trim()) {
                await ctx.runAction(api.ycloud.sendWhatsAppMessage, {
                  tenantId: args.tenantId,
                  conversationId,
                  content: messageText,
                });
              }
            }
          }
        }
      } else {
        await saveMessage(ctx, components.agent, {
          threadId,
          prompt: args.text,
        });
      }

      await ctx.runMutation(internal.system.conversations.updateLastMessageAt, {
        threadId,
      });
    } catch (err) {
      console.error("YCloud processInboundMessage ERROR", {
        eventId: args.eventId,
        tenantId: args.tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
});

/** Envía un mensaje de texto por WhatsApp a un número (sin conversación). Usado p. ej. para notificar pedido despachado. */
export const sendWhatsAppToPhone = internalAction({
  args: {
    tenantId: v.id("tenants"),
    phoneNumber: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(api.integrations.getYCloudForSend, {
      tenantId: args.tenantId,
    });
    if (!integration) {
      console.warn("notifyOrderDispatched: YCloud no configurado para tenant");
      return;
    }
    const toRaw = args.phoneNumber.replace(/^whatsapp:/, "").trim().replace(/\s/g, "");
    const to = toRaw.startsWith("+") ? toRaw : `+${toRaw}`;
    const fromRaw = integration.phoneNumber.trim().replace(/\s/g, "");
    const from = fromRaw.startsWith("+") ? fromRaw : `+${fromRaw}`;
    const res = await fetch("https://api.ycloud.com/v2/whatsapp/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": integration.apiKey,
      },
      body: JSON.stringify({
        from,
        to,
        type: "text",
        text: { body: args.content.trim() },
      }),
    });
    const data = (await res.json()) as { id?: string; status?: string; message?: string };
    if (!res.ok) {
      console.error("YCloud sendWhatsAppToPhone:", data.message ?? data.status ?? res.statusText);
    }
  },
});
