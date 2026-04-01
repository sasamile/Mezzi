import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { api } from "../_generated/api";
import rag from "./ai/rag";
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
import { cancelReservation } from "./ai/tools/cancelReservation";
import { updateReservation } from "./ai/tools/updateReservation";
import { createPQR } from "./ai/tools/createPQR";
import { searchVacancies } from "./ai/tools/searchVacancies";
import { createOrder } from "./ai/tools/createOrder";
import { updateOrder } from "./ai/tools/updateOrder";
import { cancelOrder } from "./ai/tools/cancelOrder";
import { updateCustomerInfo } from "./ai/tools/updateCustomerInfo";
import { sendPdf } from "./ai/tools/sendPdf";
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
Este restaurante tiene habilitados estos módulos transaccionales: ${enabledList.join(", ")}. También puedes buscar en la base de conocimiento (menú, horarios, sedes, etc.).
NO uses herramientas de módulos que no estén habilitados (ej. no uses createOrderTool si pedidos no está habilitado). Sin embargo, SIEMPRE sigue las instrucciones del prompt del restaurante para flujos informativos (domicilios, preguntas frecuentes, etc.) aunque no sean un módulo habilitado.
${!hasReservas ? `- Si el cliente pide RESERVA y reservas NO está habilitado → responde: "Lo sentimos, este restaurante no ofrece reservas por WhatsApp. Te recomendamos contactar directamente al restaurante."` : "- Si el cliente quiere hacer una RESERVA y reservas está habilitado, puedes crearla usando createReservationTool cuando tengas los datos completos."}
${!hasPedidos ? `- PEDIDOS DIRECTOS: el módulo de pedidos NO está habilitado, por lo tanto NO puedes usar createOrderTool ni tomar pedidos directamente.\n- Sin embargo, si el cliente pregunta por DOMICILIOS, DELIVERY o quiere PEDIR algo, NO lo rechaces de inmediato. Sigue las instrucciones del prompt del restaurante (que puede tener un flujo de domicilios que recomienda sedes cercanas y redirige a Rappi u otro canal). Si el prompt del restaurante no tiene flujo de domicilios, entonces sí informa que no se toman pedidos por este canal y sugiere contactar al restaurante.` : "- Si el cliente quiere hacer un PEDIDO y pedidos está habilitado, toma el pedido normalmente y usa createOrderTool."}
${!hasPqr
    ? `- Si el cliente pide QUEJA/RECLAMO/PQR y PQR NO está habilitado → responde: "Lo sentimos, no podemos recibir quejas o reclamos por este canal. Te recomendamos contactar directamente al restaurante."`
    : "- Si el cliente quiere hacer una PQR (petición, queja o reclamo) y PQR está habilitado, SIEMPRE registra la PQR usando createPQRTool. NUNCA digas que no puedes recibir quejas o reclamos por este canal."}
${!hasTrabajaConNosotros
    ? `- Si el cliente pregunta por VACANTES/TRABAJO y trabaja con nosotros NO está habilitado → responde: "Lo sentimos, no tengo información de vacantes por este canal. Te recomendamos contactar directamente al restaurante."`
    : "- Si el cliente pregunta por vacantes o quiere trabajar: llama searchVacanciesTool y responde con correos/enlaces que devuelva la herramienta. No hay herramienta de postulación automática en el sistema."}

[Fin MÓDULOS HABILITADOS]\n\n`
          : "";

        const tenantPrompt = await ctx.runQuery(api.prompts.getDefault, {
          tenantId: args.tenantId,
        });

        // PDFs configurados del restaurante (para que el agente sepa qué puede enviar)
        const availablePdfs = await ctx.runQuery(api.pdfs.list, {
          tenantId: args.tenantId,
        });
        const pdfsContext =
          availablePdfs && availablePdfs.length > 0
            ? `[PDFs DISPONIBLES PARA ENVIAR]\nPuedes enviar los siguientes documentos usando sendPdfTool con el label exacto:\n${availablePdfs.map((p: { label: string }) => `- "${p.label}"`).join("\n")}\nREGLA PRIORITARIA:\n- Si el cliente pide menú, decoraciones, promociones o cualquier documento disponible, usa sendPdfTool.\n- Si existe un PDF que coincida con lo pedido, NO compartas enlaces externos (Drive, etc.). Envía el PDF configurado en este módulo.\n[Fin PDFs DISPONIBLES]\n\n`
            : "";
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

        // Pre-búsqueda RAG: inyecta contexto relevante directamente en el prompt.
        // Esto garantiza que el agente tenga la información del negocio sin depender
        // exclusivamente de que llame a searchTool con la query exacta correcta.
        // El agente usa esta información como fuente de verdad primaria.
        let preloadedRagContext = "";
        const isLocationQuery = /(sede|local|horario|direcci[oó]n|ubicaci[oó]n|domicilio|barrio|ciudad)/i.test(clientText);
        const isFoodQuery = /(men[uú]|precio|carta|plato|comida|comer|venden|tienen|ofrec|sirven|preparan|sopa|hamburguesa|carne|pollo|pescado|cerdo|ensalada|bebida|jugo|limonada|postre|entrada|acompa[ñn]|combo|bandeja|arroz|costilla|churrasco|solomito|infantil|vegeta)/i.test(clientText);
        const isInfoQuery = isLocationQuery || isFoodQuery;
        if (isInfoQuery) {
          try {
            const ragQueries: string[] = [clientText];

            if (isLocationQuery) {
              const cityMatch = clientText.match(/(medell[ií]n|bogot[aá]|barranquilla|rionegro|villavicencio|urab[aá]|bello|envigado|itagü?i|sabaneta)/i);
              if (cityMatch) {
                const normalized = cityMatch[1].toUpperCase().replace(/[ÍÌÎÏ]/g,"I").replace(/[ÁÀÂÄ]/g,"A").replace(/[ÉÈÊË]/g,"E").replace(/[ÚÙÛÜ]/g,"U");
                ragQueries.push(`LOCALES ${normalized} horarios direcciones`);
                ragQueries.push(`UBICACIONES ${normalized}`);
              } else {
                ragQueries.push("LOCALES horarios direcciones sedes");
              }
            }

            if (isFoodQuery) {
              ragQueries.push("carta platos bebidas menú");
              ragQueries.push("combo hamburguesa carne pollo pescado");

              // Sinónimos gastronómicos para que el RAG encuentre los platos reales
              const cl = clientText.toLowerCase();
              if (/sopas?/.test(cl)) ragQueries.push("sancocho trifásico ajiaco santafereño cazuela paisa cazuela montañera calentado");
              if (/sancocho/.test(cl)) ragQueries.push("sancocho trifásico ajiaco cazuela");
              if (/ajiaco/.test(cl)) ragQueries.push("ajiaco santafereño sancocho cazuela");
              if (/parrill|asado/.test(cl)) ragQueries.push("churrasco baby beef punta de anca bife de chorizo solomito costillas");
              if (/t[ií]pic/.test(cl)) ragQueries.push("bandeja paisa calentado paisa arroz paisa sancocho");
              if (/entrada/.test(cl)) ragQueries.push("chorizo deditos mozarella chicharrón empanaditas yuquitas patacones");
              if (/vegetarian/.test(cl)) ragQueries.push("ensalada de la casa atún al carbón arepa de queso");
              if (/infantil|niño/.test(cl)) ragQueries.push("menú infantil nuggets pollo");
            }

            let ragResult = { entries: [] as { title?: string }[], text: "" };
            for (const q of ragQueries) {
              const result = await rag.search(ctx, {
                namespace: args.tenantId,
                query: q,
                limit: 15,
              });
              if (result.entries.length > ragResult.entries.length) {
                ragResult = result;
              }
              if (ragResult.entries.length >= 5) break;
            }

            if (ragResult.entries.length > 0) {
              preloadedRagContext =
                `[BASE DE CONOCIMIENTO DEL RESTAURANTE — FUENTE DE VERDAD OBLIGATORIA]\n` +
                `INSTRUCCIÓN: Los datos a continuación son los únicos válidos para responder sobre sedes, locales, horarios, direcciones, menú, platos y precios de ESTE restaurante. NO uses ningún dato que no aparezca en este bloque. Responde basándote SOLO en esta información.\n\n` +
                ragResult.text +
                `\n[Fin BASE DE CONOCIMIENTO]\n\n`;
            }
          } catch (ragErr) {
            console.warn("ycloud: pre-búsqueda RAG falló (no crítico)", ragErr instanceof Error ? ragErr.message : ragErr);
          }
        }

        const promptWithContext =
          modulesContext +
          customerContext +
          dateTimeContext +
          pdfsContext +
          preloadedRagContext +
          imageContext +
          (tenantPrompt?.prompt?.trim()
            ? `[Contexto del restaurante:]\n${tenantPrompt.prompt}\n\n`
            : "") +
          lastQuestionContext +
          `[Cliente dice:]\n${clientText}`;

        const tools: Record<string, unknown> = {
          searchTool: search,
          sendPdfTool: sendPdf,
          updateCustomerInfoTool: updateCustomerInfo,
          escalateConversationTool: escalateConversation,
          setPriorityTool: setPriority,
          resolveConversationTool: resolveConversation,
        };
        if (hasReservas) {
          tools.createReservationTool = createReservation;
          tools.cancelReservationTool = cancelReservation;
          tools.updateReservationTool = updateReservation;
        }
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
          const errMessage =
            agentErr instanceof Error
              ? agentErr.message
              : typeof agentErr === "object" && agentErr !== null
                ? JSON.stringify(agentErr)
                : String(agentErr);
          console.error("YCloud: generateText falló (revisa OPENAI_API_KEY, créditos OpenAI y logs del agente en Convex)", {
            tenantId: args.tenantId,
            conversationId,
            threadId,
            error: errMessage,
            stack: agentErr instanceof Error ? agentErr.stack : undefined,
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
          /** Extrae texto plano del contenido de un mensaje del agente */
          function extractText(content: unknown): string {
            if (typeof content === "string") return content;
            if (Array.isArray(content)) {
              return (content as { type: string; text?: string }[])
                .filter((p) => p.type === "text")
                .map((p) => p.text ?? "")
                .join("");
            }
            return String(content ?? "");
          }

          /** Convierte salidas JSON del modelo en texto plano para WhatsApp. */
          function normalizeOutgoingText(text: string): string {
            const trimmed = text.trim();
            if (!trimmed) return "";
            if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) return trimmed;
            try {
              const parsed = JSON.parse(trimmed) as {
                response?: unknown;
                message?: unknown;
                text?: unknown;
              };
              const candidates = [parsed.response, parsed.message, parsed.text];
              for (const value of candidates) {
                if (typeof value === "string" && value.trim()) return value.trim();
              }
            } catch {
              // Si no es JSON válido, se envía el texto original.
            }
            return trimmed;
          }

          // Usar el texto devuelto directamente por el agente
          const directText = normalizeOutgoingText(
            typeof agentResult?.text === "string" ? agentResult.text : ""
          );

          /** Envía texto a WhatsApp; devuelve false si falla (sin lanzar). */
          async function trySend(text: string): Promise<boolean> {
            const t = normalizeOutgoingText(text).trim();
            if (!t) return false;
            try {
              await ctx.runAction(api.ycloud.sendWhatsAppMessage, {
                tenantId: args.tenantId,
                conversationId,
                content: t,
              });
              return true;
            } catch (sendErr) {
              console.error("YCloud: error al enviar respuesta", {
                tenantId: args.tenantId,
                error: sendErr instanceof Error ? sendErr.message : String(sendErr),
              });
              return false;
            }
          }

          // Detectar tools que ya enviaron su propio mensaje de WhatsApp directamente.
          // En esos casos la continuación generaría texto redundante o fuera de orden.
          const calledToolNames = (
            (agentResult?.toolCalls ?? []) as Array<{ toolName: string }>
          ).map((tc) => tc.toolName);
          const SELF_SENDING_TOOLS = new Set([
            "resolveConversationTool",
            "escalateConversationTool",
            "createPQRTool",
            "cancelOrderTool",
            "updateOrderTool",
            "sendPdfTool",
            "cancelReservationTool",
            "updateReservationTool",
            // createReservationTool ya NO envía WhatsApp directamente;
            // el LLM maneja la confirmación via directText.
          ]);
          const toolAlreadySentMessage = calledToolNames.some((name) =>
            SELF_SENDING_TOOLS.has(name)
          );

          // Si el createReservationTool falló (prefijo RESERVA_ERROR:), bloquear
          // el directText del LLM para que no confirme una reserva que no existe.
          const toolResults = (agentResult?.toolResults ?? []) as Array<{ result?: unknown }>;
          const reservationFailed = toolResults.some((tr) =>
            typeof tr.result === "string" && tr.result.startsWith("RESERVA_ERROR:")
          );

          if (directText && !reservationFailed) {
            await trySend(directText);
          } else if (reservationFailed) {
            // Si falló la reserva, enviar un mensaje explícito al cliente para evitar silencio.
            const rawReservationError = toolResults
              .map((tr) => (typeof tr.result === "string" ? tr.result : ""))
              .find((r) => r.startsWith("RESERVA_ERROR:"));
            const reservationError = rawReservationError
              ? rawReservationError.replace(/^RESERVA_ERROR:\s*/, "").trim()
              : "";
            const fallbackErrorText =
              "Lo siento, hubo un problema técnico al guardar la reserva. " +
              "¿Puedes intentarlo nuevamente por favor?";
            await trySend(reservationError || fallbackErrorText);
          } else if (toolAlreadySentMessage) {
            // El tool ya envió la confirmación al cliente — no enviar nada más
          } else {
            // El agente no produjo texto final (solo llamó herramientas y se detuvo).
            // Esto ocurre cuando gpt-4o decide que el resultado de la herramienta
            // es suficiente y no genera texto de continuación.
            //
            // Estrategia en cascada:
            // 1. Hacer una segunda llamada al agente SIN herramientas (solo genera texto).
            // 2. Si esa también falla o devuelve vacío, buscar en el hilo el último
            //    mensaje de herramienta con contenido útil (ej. searchTool).
            let sent = false;

            try {
              const continuationResult = await supportAgent.generateText(
                ctx,
                { threadId },
                {
                  prompt:
                    "Continúa la conversación con el cliente. Ya ejecutaste las herramientas necesarias. " +
                    "Haz la siguiente pregunta del flujo activo o entrega la información solicitada. " +
                    "No menciones herramientas ni procesos internos.",
                  // Sin herramientas: solo genera texto, no puede llamar tools de nuevo
                }
              );
              const continuationText =
                typeof continuationResult?.text === "string" ? continuationResult.text : "";
              if (continuationText) {
                sent = await trySend(continuationText);
              }
            } catch (contErr) {
              console.error("YCloud: segunda llamada al agente falló", {
                tenantId: args.tenantId,
                error: contErr instanceof Error ? contErr.message : String(contErr),
              });
            }

            if (!sent) {
              // Último recurso: buscar en el hilo el resultado de searchTool
              // (que ya es una respuesta formateada para el cliente).
              await new Promise((r) => setTimeout(r, 300));
              const messagesAfter: PaginationResult<MessageDoc> =
                await supportAgent.listMessages(ctx, {
                  threadId,
                  paginationOpts: { numItems: 100, cursor: null },
                });

              for (let i = messagesAfter.page.length - 1; i >= 0; i--) {
                const msg = messagesAfter.page[i];
                const role = msg.message?.role;
                const content = msg.message?.content;
                if (role === "assistant") {
                  const t = extractText(content);
                  if (t.trim()) { await trySend(t); break; }
                } else if (role === "tool") {
                  const t = typeof content === "string" ? content : extractText(content);
                  const isInternal = t.includes("INSTRUCCIÓN:") || t.includes("✅");
                  if (!isInternal && t.trim().length > 30) { await trySend(t); break; }
                }
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
