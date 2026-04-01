import { openai } from "@ai-sdk/openai";
import { Agent } from "@convex-dev/agent";
import { components } from "../../../_generated/api";
import { SUPPORT_AGENT_PROMPT } from "../constants";
import { OPENAI_MODEL_PRIMARY } from "../openaiModels";

export const supportAgent = new Agent(components.agent, {
  chat: openai.chat(OPENAI_MODEL_PRIMARY),
  instructions: SUPPORT_AGENT_PROMPT,
  contextOptions: {
    recentMessages: 20,
    excludeToolMessages: true,
  },
});
