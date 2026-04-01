import { action } from "./_generated/server";
import { v } from "convex/values";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { OPENAI_MODEL_PRIMARY } from "./system/ai/openaiModels";

const IMPROVE_PROMPT = `Eres un asistente que mejora mensajes para atención al cliente por WhatsApp.

Reglas:
1. Mantén el mensaje breve y claro.
2. Sé amable y profesional.
3. Usa un tono cercano pero respetuoso.
4. NO uses emojis a menos que el original los tenga.
5. Usa saltos de línea para separar ideas.
6. NO inventes información. Solo mejora redacción y tono.
7. Devuelve ÚNICAMENTE el texto mejorado, sin explicaciones.
8. Escribe en el mismo idioma que el mensaje original.`;

/**
 * Mejora el texto de un mensaje para enviar por WhatsApp.
 * Para el botón "varita" en el input del inbox.
 */
export const improve = action({
  args: { text: v.string() },
  handler: async (_ctx, args) => {
    const t = args.text.trim();
    if (!t) return "";

    const { text } = await generateText({
      messages: [
        { role: "system", content: IMPROVE_PROMPT },
        { role: "user", content: t },
      ],
      model: openai.chat(OPENAI_MODEL_PRIMARY),
    });

    return text;
  },
});
