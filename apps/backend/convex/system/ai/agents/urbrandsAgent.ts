import { openai } from "@ai-sdk/openai";
import { Agent } from "@convex-dev/agent";
import { components } from "../../../_generated/api";
import { URBRANDS_AGENT_INSTRUCTIONS } from "../urbrandsPrompts";
import { OPENAI_MODEL_PRIMARY } from "../openaiModels";

/**
 * Agente dedicado a URBRANDS ("Danna"). Usa instrucciones propias (no las de
 * restaurantes). La configuración del negocio (flujos, mensajes, horarios, links)
 * se inyecta como contexto desde tenantPrompts, editable en el panel admin.
 */
export const urbrandsAgent = new Agent(components.agent, {
  chat: openai.chat(OPENAI_MODEL_PRIMARY),
  instructions: URBRANDS_AGENT_INSTRUCTIONS,
  contextOptions: {
    recentMessages: 20,
    excludeToolMessages: true,
  },
});
