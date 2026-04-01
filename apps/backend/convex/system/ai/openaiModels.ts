/**
 * Modelos OpenAI (Vercel AI SDK). Un solo lugar para ajustar calidad vs coste.
 *
 * - gpt-4o: mejor razonamiento, menos inconsistencias en tools y RAG.
 * - gpt-4o-mini: más barato; reservar para tareas muy simples si hace falta.
 */
export const OPENAI_MODEL_PRIMARY = "gpt-4o" as const;
export const OPENAI_MODEL_MINI = "gpt-4o-mini" as const;
