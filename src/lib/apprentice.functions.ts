import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const eventSchema = z.object({
  id: z.string(),
  t: z.number(),
  action: z.string(),
  summary: z.string(),
  significance: z.enum(["low", "high"]),
  explained: z.boolean(),
});
const lineSchema = z.object({ t: z.number(), who: z.string(), text: z.string() });
const qaSchema = z.object({ q: z.string(), a: z.string() });

async function safeRedact(text: string) {
  const { redactText } = await import("./redact.server");
  return (await redactText(text)).text;
}
async function transcriptText(lines: { t: number; who: string; text: string }[]) {
  const out: string[] = [];
  for (const l of lines.slice(-120)) out.push(`[${Math.round(l.t)}s] ${l.who}: ${await safeRedact(l.text)}`);
  return out.join("\n");
}

/** Vision: confronta due fotogrammi consecutivi e descrive l'evento. */
export const describeFrameDiff = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        prev: z.string().max(400_000).optional(),
        curr: z.string().max(400_000),
        hint: z.string().max(1500),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { callAIJson } = await import("./ai.server");
    const res = await callAIJson<{ action: string; summary: string; significance: "low" | "high" }>({
      system:
        "You are Marta, an architecture apprentice. Compare consecutive screen frames and reliable app facts. Describe the change in one brief English present-tense sentence, naming the sheet. significance=high for a decision (revision, phase, approval, issue); low for navigation or a trivial note. Return JSON: {\"action\":\"...\",\"summary\":\"...\",\"significance\":\"low|high\"}. Keep action within 12 words.",
      user: `Reliable app facts:\n${data.hint}\n\nFirst frame = before, second = after.`,
      images: data.prev ? [data.prev, data.curr] : [data.curr],
      effort: "low",
    });
    return res;
  });

/** Debrief: sceglie 3 eventi mai spiegati dal vivo. */
export const pickDebriefQuestions = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ events: z.array(eventSchema), transcript: z.array(lineSchema), asked: z.array(z.string()) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { callAIJson } = await import("./ai.server");
    const res = await callAIJson<{ questions: { eventId: string; text: string }[] }>({
      system:
        "You are Marta, a 24-year-old architecture apprentice. Choose EXACTLY three events whose reasons were not explained live (explained=false or a vague transcript answer). Ask one short English question per event, no more than 20 words, about why or when not to do it. Do not repeat live questions. If fewer than three events remain, ask about general limits with an empty eventId. Return JSON: {\"questions\":[{\"eventId\":\"...\",\"text\":\"...\"}]}",
      user: `Events:\n${JSON.stringify(data.events)}\n\nTranscript:\n${await transcriptText(data.transcript)}\n\nQuestions already asked live:\n${data.asked.join("\n") || "(none)"}`,
    });
    const qs = (res.questions ?? []).slice(0, 3);
    return { questions: qs };
  });

/** Teach-back: rispiega tutto il processo con parole sue. */
export const buildTeachBack = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        events: z.array(eventSchema),
        transcript: z.array(lineSchema),
        answers: z.array(qaSchema),
        correction: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { callAIJson } = await import("./ai.server");
    const res = await callAIJson<{ text: string }>({
      system:
        "You are Marta, a 24-year-old architecture apprentice. Explain the whole observed process in your own words in English, first person: actions, decisions, reasons and guardrails. At most 120 words, 4–6 spoken sentences, no bullets. Never invent facts; incorporate any expert correction. Return JSON: {\"text\":\"...\"}.",
      user: `Events:\n${JSON.stringify(data.events)}\n\nTranscript:\n${await transcriptText(data.transcript)}\n\nDebrief answers:\n${await safeRedact(JSON.stringify(data.answers))}\n\nExpert correction: ${data.correction ? await safeRedact(data.correction) : "(none)"}`,
      effort: "medium",
    });
    return res;
  });

const stepSchema = z.object({
  eventId: z.string().nullable().optional(),
  action: z.string(),
  decision: z.string(),
  reason_quote: z.string(),
  guardrails: z
    .array(
      z.object({
        rule: z.string(),
        eventId: z.string().nullable().optional(),
        t: z.number().optional(),
        reason_quote: z.string().default(""),
        check: z.object({
          kind: z.enum(["rev_mismatch", "second_approval", "phase_forbidden", "no_issue_if_held", "custom"]),
          tag: z.enum(["pianta", "prospetto", "sezione", "interrato", "giardino"]).optional(),
          phase: z.enum(["Permesso", "Esecutivo", "Cliente"]).optional(),
        }),
      }),
    )
    .default([]),
  confidence: z.number().min(0).max(1),
});

export const buildWorkMap = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        expert: z.string(),
        events: z.array(eventSchema),
        transcript: z.array(lineSchema),
        answers: z.array(qaSchema),
        correction: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { callAIJson } = await import("./ai.server");
    const res = await callAIJson<{
      title: string;
      summary: string;
      steps: z.infer<typeof stepSchema>[];
    }>({
      system: `You are Marta, an architecture apprentice. Build an English Work Map of the expert's process. For each important work moment include action, decision, reason_quote (the expert's OWN WORDS from transcript or answers; tidy wording but never invent; if unexplained, use an empty string and confidence ≤ 0.4), guardrails (limits or exceptions the expert named), eventId (related event ID or null).
Each guardrail needs rule, reason_quote (expert's quote), eventId, t (event seconds if known) and check:
- {"kind":"rev_mismatch"}: don't issue a sheet if linked revisions differ
- {"kind":"second_approval","tag":"pianta|prospetto|sezione|interrato|giardino"}: a sheet of this kind needs second approval before issue
- {"kind":"phase_forbidden","tag":"...","phase":"Permesso|Esecutivo|Cliente"}: this sheet type must never be in that phase
- {"kind":"no_issue_if_held"}: don't issue held sheets
- {"kind":"custom"}: another limit not automatically checkable
Return JSON: {"title":"...","summary":"two sentences","steps":[{"eventId":"...","action":"...","decision":"...","reason_quote":"...","guardrails":[...],"confidence":0.0}]}. Chronological, at most eight steps.`,
      user: `Expert: ${data.expert}\nEvents:\n${JSON.stringify(data.events)}\n\nTranscript:\n${await transcriptText(data.transcript)}\n\nDebrief answers:\n${await safeRedact(JSON.stringify(data.answers))}\n\nExpert correction to teach-back: ${data.correction ? await safeRedact(data.correction) : "(none)"}`,
      effort: "medium",
    });
    const steps = (res.steps ?? []).map((s) => stepSchema.safeParse(s)).filter((r) => r.success).map((r) => r.data!);
    return { title: res.title, summary: res.summary, steps };
  });

/** Fallback AI per i guardrail "custom" nel Voice Tutor. */
export const judgeAction = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ rules: z.array(z.string()), situation: z.string().max(3000) }).parse(d))
  .handler(async ({ data }) => {
    const { callAIJson } = await import("./ai.server");
    return callAIJson<{ violates: boolean; ruleIndex: number | null; why: string }>({
      system:
        "You are the Voice Tutor. Compare the new hire’s pending save against the expert’s rules. Return JSON: {\"violates\":true,\"ruleIndex\":0,\"why\":\"one English sentence\"}. Use false and null when no rule is broken.",
      user: `Rules:\n${data.rules.map((r, i) => `${i}. ${r}`).join("\n")}\n\nSituation:\n${data.situation}`,
    });
  });

export const tutorVerifyQuestion = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ rules: z.array(z.string()), attempts: z.string(), lang: z.enum(["it", "en"]).default("en") }).parse(d))
  .handler(async ({ data }) => {
    const { callAIJson } = await import("./ai.server");
    return callAIJson<{ question: string }>({
      system:
        `You are Marta, now a tutor. Ask ONE brief check question (at most 22 words, in ${data.lang === "en" ? "English" : "Italian"}) to see if the colleague understands WHY a rule matters, whether they broke or followed it. Return JSON: {"question":"..."}.`,
      user: `Expert rules:\n${data.rules.join("\n")}\n\nColleague attempts:\n${data.attempts}`,
    });
  });

export const evaluateLearning = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ rules: z.array(z.string()), question: z.string(), answer: z.string().max(2000), attempts: z.string(), lang: z.enum(["it", "en"]).default("en") }).parse(d),
  )
  .handler(async ({ data }) => {
    const { callAIJson } = await import("./ai.server");
    return callAIJson<{ score: number; verdict: string }>({
      system: `Assess whether the new hire learned. Compare the answer with expert rules (what and why) and their attempts. Score 0–100. Write a one-sentence verdict in ${data.lang === "en" ? "English" : "Italian"} explaining what they understood and what remains. Return JSON: {"score":0,"verdict":"..."}.`,
      user: `Rules:\n${data.rules.join("\n")}\n\nAttempts:\n${data.attempts}\n\nQuestion: ${data.question}\nAnswer: ${await safeRedact(data.answer)}`,
      effort: "medium",
    });
  });

const langName = (l: "it" | "en") => (l === "en" ? "English" : "Italian");
const langSchema = z.enum(["it", "en"]).default("en");

/** Traduce la Work Map in inglese (si salva in entrambe le lingue). */
export const translateWorkMap = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        title: z.string(),
        summary: z.string(),
        steps: z.array(
          z.object({
            id: z.string(),
            action: z.string(),
            decision: z.string(),
            reason_quote: z.string(),
            guardrails: z.array(z.object({ rule: z.string(), reason_quote: z.string() })),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { callAIJson } = await import("./ai.server");
    return callAIJson<{
      title: string;
      summary: string;
      steps: { id: string; action: string; decision: string; reason_quote: string; guardrails: { rule: string; reason_quote: string }[] }[];
    }>({
      system:
        "Translate this expert architect’s Work Map into natural professional English. Keep IDs, order and number of guardrails unchanged. Expert quotes (reason_quote) stay in first person. Return the same JSON structure.",
      user: JSON.stringify(data),
      effort: "low",
    });
  });

/** Privacy fotogrammi: trova le zone di testo con dati personali (box normalizzati 0-1). */
export const findPiiBoxes = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ frame: z.string().max(400_000) }).parse(d))
  .handler(async ({ data }) => {
    const { callAIJson } = await import("./ai.server");
    try {
      const res = await callAIJson<{ boxes: { x: number; y: number; w: number; h: number; type: string }[] }>({
        system:
          "You are a privacy filter. Locate TEXT regions in the image containing people’s names, email, telephone, IBAN, tax IDs and postal addresses. Exclude drawing titles, revision labels, project phases and technical text. Return boxes with 0–1 coordinates (x,y = top-left, w,h = size) and a small margin. JSON: {\"boxes\":[{\"x\":0,\"y\":0,\"w\":0,\"h\":0,\"type\":\"PERSON|EMAIL_ADDRESS|PHONE_NUMBER|IBAN_CODE|IT_FISCAL_CODE|LOCATION\"}]}. If none: {\"boxes\":[]}.",
        user: "Locate personal information regions.",
        images: [data.frame],
        effort: "low",
      });
      const boxes = (res.boxes ?? [])
        .filter((b) => [b.x, b.y, b.w, b.h].every((n) => typeof n === "number" && n >= 0 && n <= 1) && b.w > 0 && b.h > 0)
        .slice(0, 20);
      return { boxes, ok: true as const };
    } catch (e) {
      console.error("findPiiBoxes", e);
      return { boxes: [] as { x: number; y: number; w: number; h: number; type: string }[], ok: false as const };
    }
  });

/** Previsione: confronta la risposta del nuovo assunto con il passaggio della Work Map. */
export const evaluatePrediction = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        lang: langSchema,
        step: z.object({ action: z.string(), decision: z.string(), reason_quote: z.string(), guardrails: z.array(z.string()) }),
        answer: z.string().max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { callAIJson } = await import("./ai.server");
    return callAIJson<{ score: number; feedback: string }>({
      system: `You are Marta, now a tutor. The colleague answered “What should be done next, and why?” Compare with the Work Map step: right action and reasoning? Score 0–100. Give 1–2 sentences of feedback in ${langName(data.lang)} about what they got and missed; cite the expert if helpful. Return JSON: {"score":0,"feedback":"..."}.`,
      user: `Step: ${JSON.stringify(data.step)}\nAnswer: ${await safeRedact(data.answer)}`,
    });
  });

/** Resoconto finale: padroneggiato / da esercitare per passaggio e guardrail. */
export const buildMasteryReport = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        lang: langSchema,
        steps: z.array(z.object({ id: z.string(), action: z.string(), guardrails: z.array(z.string()) })),
        predictions: z.array(z.object({ stepId: z.string(), score: z.number(), feedback: z.string() })),
        attempts: z.array(z.object({ stepId: z.string().optional(), guardrail: z.string().optional(), blocked: z.boolean() })),
        finalAnswer: z.string().optional(),
        finalScore: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { callAIJson } = await import("./ai.server");
    return callAIJson<{
      steps: { stepId: string; status: "mastered" | "practice"; note: string }[];
      guardrails: { rule: string; stepId: string; status: "mastered" | "practice"; note: string }[];
      nextExercise: string;
    }>({
      system: `You are Marta, a tutor. For EVERY step and guardrail in the new hire’s case, set status to "mastered" (prediction at least 70 and no block for that rule) or "practice". Write a brief note in ${langName(data.lang)} (at most 18 words) and a specific nextExercise in the same language. Preserve the supplied stepIds and rules. Return JSON with steps [{stepId,status,note}], guardrails [{rule,stepId,status,note}], nextExercise.`,
      user: JSON.stringify(data),
      effort: "medium",
    });
  });
