import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import rag from "./system/ai/rag";
import { SEARCH_INTERPRETER_PROMPT } from "./system/ai/constants";
import { OPENAI_MODEL_PRIMARY } from "./system/ai/openaiModels";

type Confidence = "high" | "medium" | "low";

/**
 * Responde una pregunta sobre la empresa usando el RAG del tenant.
 * Límite: 2000 créditos/día por tenant. Devuelve texto, confianza y fuentes.
 */
export const ask = action({
  args: {
    tenantId: v.id("tenants"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const q = args.query.trim();
    if (!q) {
      return {
        text: "Por favor escribe una pregunta.",
        confidence: "low" as Confidence,
        sources: [] as string[],
      };
    }

    await ctx.runMutation(api.learning.useCredit, { tenantId: args.tenantId });

    const searchResult = await rag.search(ctx, {
      namespace: args.tenantId,
      query: q,
      limit: 5,
    });

    const sourceTitles = searchResult.entries
      .map((e) => e.title)
      .filter((t): t is string => t != null && t !== "");

    const contextText =
      searchResult.entries.length > 0
        ? `Resultados en ${sourceTitles.join(", ")}. Contexto:\n\n${searchResult.text}`
        : "No se encontró información relevante en la base de conocimiento.";

    const response = await generateText({
      messages: [
        { role: "system", content: SEARCH_INTERPRETER_PROMPT },
        {
          role: "user",
          content: `Pregunta: ${q}\n\nBúsqueda: ${contextText}`,
        },
      ],
      model: openai.chat(OPENAI_MODEL_PRIMARY),
    });

    const confidence: Confidence =
      searchResult.entries.length >= 2
        ? "high"
        : searchResult.entries.length === 1
          ? "medium"
          : "low";

    await ctx.runMutation(api.learning.recordConfidence, {
      tenantId: args.tenantId,
      highConfidence: confidence === "high",
    });

    return {
      text: response.text,
      confidence,
      sources: sourceTitles,
    };
  },
});
