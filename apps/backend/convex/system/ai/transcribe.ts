/**
 * Transcripción de notas de voz de WhatsApp con OpenAI Whisper.
 *
 * El pipeline de YCloud entrega la URL del audio (msg.mediaUrl). Aquí descargamos
 * el archivo y lo enviamos a la API de transcripción de OpenAI.
 *
 * Requiere OPENAI_API_KEY en las variables de entorno de Convex (la misma que usa
 * el AI SDK). Si falla o no está configurada, devuelve "" y el flujo continúa con
 * el marcador [AUDIO SIN TRANSCRIPCIÓN].
 */
export async function transcribeAudioFromUrl(audioUrl: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("transcribeAudioFromUrl: OPENAI_API_KEY no configurada");
    return "";
  }

  try {
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      console.warn("transcribeAudioFromUrl: no se pudo descargar el audio", audioRes.status);
      return "";
    }
    const blob = await audioRes.blob();

    const form = new FormData();
    form.append("file", blob, "audio.ogg");
    form.append("model", "whisper-1");
    form.append("language", "es");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      console.warn("transcribeAudioFromUrl: transcripción falló", res.status);
      return "";
    }

    const data = (await res.json()) as { text?: string };
    return (data.text ?? "").trim();
  } catch (err) {
    console.warn(
      "transcribeAudioFromUrl: error inesperado",
      err instanceof Error ? err.message : err
    );
    return "";
  }
}
