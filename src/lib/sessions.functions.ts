import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const payload = z.object({
  kind: z.enum(["capture", "tutor"]),
  title: z.string().max(200),
  person: z.string().max(100),
  sheetId: z.string().nullable().optional(),
  events: z.array(z.any()),
  questions: z.array(z.any()),
  transcript: z.array(z.any()),
  workMap: z.any().nullable().optional(),
  teachbackConfirmed: z.boolean(),
  tests: z.record(z.any()).default({}),
  score: z.any().nullable().optional(),
});

/** Ogni stringa passa dall'oscuramento PII prima di toccare il database. */
async function redactDeep<T>(value: T, counter: { n: number }): Promise<T> {
  const { redactText } = await import("./redact.server");
  async function walk(v: unknown, key?: string): Promise<unknown> {
    if (typeof v === "string") {
      if (key === "frame" || key === "frameUrl" || key === "id" || key === "eventId" || key === "sheetId" || v.startsWith("data:") || v.startsWith("/demo/")) return v;
      const r = await redactText(v);
      counter.n += r.count;
      return r.text;
    }
    if (Array.isArray(v)) return Promise.all(v.map((x) => walk(x)));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = await walk(x, k);
      return out;
    }
    return v;
  }
  return (await walk(value)) as T;
}

export const saveSession = createServerFn({ method: "POST" })
  .inputValidator((d) => payload.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const counter = { n: 0 };
    const clean = await redactDeep(data, counter);
    const { data: row, error } = await supabaseAdmin
      .from("apprentice_sessions")
      .insert({
        kind: clean.kind,
        title: clean.title,
        person: clean.person,
        sheet_id: clean.sheetId ?? null,
        events: clean.events,
        questions: clean.questions,
        transcript: clean.transcript,
        work_map: clean.workMap ?? null,
        teachback_confirmed: clean.teachbackConfirmed,
        tests: clean.tests,
        score: clean.score ?? null,
        redactions: counter.n,
      })
      .select("id")
      .single();
    if (error) {
      console.error("saveSession", error);
      throw new Error("Salvataggio non riuscito");
    }
    return { id: row.id as string, redactions: counter.n, transcript: clean.transcript as { t: number; who: string; text: string }[] };
  });

export const listSessions = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("apprentice_sessions")
    .select("id,kind,title,person,created_at,work_map,events,questions,transcript,teachback_confirmed,redactions,score,tests")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("listSessions", error);
    throw new Error("Impossibile leggere le sessioni");
  }
  return JSON.parse(JSON.stringify(data ?? [])) as unknown as import("./types").SessionRow[];
});

export const previewRedaction = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ text: z.string().max(5000) }).parse(d))
  .handler(async ({ data }) => {
    const { redactText } = await import("./redact.server");
    return redactText(data.text);
  });
