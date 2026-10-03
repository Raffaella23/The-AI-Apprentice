const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

export interface AiArgs {
  system: string;
  user: string;
  images?: string[]; // data URL o URL
  effort?: "low" | "medium";
}

/** Chiamata Responses API in streaming; accumula il testo finale. */
export async function callAI({ system, user, images = [], effort = "low" }: AiArgs): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("LOVABLE_API_KEY mancante");
  const content: Record<string, unknown>[] = [{ type: "input_text", text: user }];
  for (const img of images) content.push({ type: "input_image", image_url: img });
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      store: false,
      reasoning: { effort, summary: "auto" },
      include: ["reasoning.encrypted_content"],
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    console.error(`AI gateway ${res.status}: ${body}`);
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        else if (ev.type === "response.failed" || ev.type === "error") {
          throw new Error(JSON.stringify(ev.response?.error ?? ev.error ?? ev).slice(0, 300));
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  if (!text.trim()) throw new Error("Risposta AI vuota");
  return text;
}

export async function callAIJson<T>(args: AiArgs): Promise<T> {
  const raw = await callAI({ ...args, system: `${args.system}\nRespond ONLY with a valid JSON object, without extra text or code fences.` });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("JSON non trovato nella risposta AI");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}
