import { openai } from "@ai-sdk/openai";
import { Agent } from "@convex-dev/agent";
import { components } from "../../../_generated/api";
import { SUPPORT_AGENT_PROMPT } from "../constants";
import { OPENAI_MODEL_PRIMARY } from "../openaiModels";

export const supportAgent = new Agent(components.agent, {
  chat: openai.chat(OPENAI_MODEL_PRIMARY),
  instructions: SUPPORT_AGENT_PROMPT,
  /**
   * Sin esto el SDK usa maxSteps: 1, o sea que el modelo llama a una herramienta
   * y se detiene: nunca ve el resultado. Por eso el bot buscaba en la base de
   * conocimiento y respondía sin haber leído lo que encontró.
   *
   * Con 5 pasos el ciclo se completa —llamada → resultado → respuesta— y puede
   * encadenar un par de herramientas antes de contestar. El tope evita bucles.
   */
  maxSteps: 5,
  contextOptions: {
    recentMessages: 20,
    excludeToolMessages: true,
  },
});
