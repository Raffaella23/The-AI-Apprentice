import { createServerFn } from "@tanstack/react-start";

export const AGENT_ID = "agent_9601m41vrr38ejz890yg91dq8jbs";

function apiKey() {
  const key = process.env["ELEVENLABS_API_KEY"];
  if (!key) throw new Error("ElevenLabs non è collegato a questo progetto");
  return key;
}

/** Token WebRTC per l'agente ElevenLabs Expressive (Marta). */
export const getConversationToken = createServerFn({ method: "POST" }).handler(async () => {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${AGENT_ID}`, {
    headers: { "xi-api-key": apiKey() },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`ElevenLabs token ${res.status}: ${body}`);
    throw new Error(`Token agente non disponibile (${res.status})`);
  }
  const { token } = (await res.json()) as { token: string };
  return { token };
});

/** Token monouso per Scribe v2 realtime. */
export const getScribeToken = createServerFn({ method: "POST" }).handler(async () => {
  const res = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Scribe token ${res.status}: ${body}`);
    throw new Error(`Token Scribe non disponibile (${res.status})`);
  }
  const { token } = (await res.json()) as { token: string };
  return { token };
});
