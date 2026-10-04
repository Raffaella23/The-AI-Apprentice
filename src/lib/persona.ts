import type { WorkMap } from "./types";

export const MARTA = {
  name: "Marta Ricci",
  short: "Marta",
  age: 24,
  tagline: "Architecture student, three weeks into an internship. Takes notes on everything.",
  role: "Apprentice",
  origin: "From Lecco, lives in Milan",
  study: "Master’s in Architecture, specialising in building design (Politecnico di Milano)",
  thesis: "Thesis: renovating 1970s villas in Brianza",
  bio: [
    "Marta is 24, from Lecco, and studies in Milan. Her thesis explores 1970s villas in Brianza. She interns at a studio where senior architects are nearing retirement.",
    "She can draw and read plans, but is still learning when to stop—the moment a veteran architect says “wait”.",
  ],
  fear: "That a wrong dimension reaches the construction site because no one told her to check it.",
  loves: "The reason behind a line. Printed plans. Coffee after five.",
  quirks: [
    "A 2B pencil behind her ear and a squared notebook in hand.",
    "Says “Wait, let me write that down” before noting a rule.",
    "Always checks: “If I understood correctly…”",
    "Never interrupts someone drawing. Waits for a pause.",
  ],
  voice: "Young, warm, slightly excited Italian accent. Brief sentences; never sounds like a virtual assistant.",
};

export type Mood = "idle" | "listening" | "note" | "question" | "thinking" | "speaking" | "alert";

export const MOOD_LABEL: Record<Mood, string> = {
  idle: "Waiting",
  listening: "Listening",
  note: "Taking notes",
  question: "Has a question",
  thinking: "Thinking",
  speaking: "Speaking",
  alert: "Stop",
};

export const FIRST_MESSAGE_CAPTURE =
  "Good morning, Architect. I’m Marta. Work as if I’m not here; I’ll watch and take notes. I’ll ask only when you pause.";
export const FIRST_MESSAGE_DEBRIEF =
  "Architect, I’ve noted three things I’d like to understand. May I ask?";
export const FIRST_MESSAGE_TUTOR =
  "Hi, I’m Marta. I learned by watching the architect work. Before key steps, I’ll ask what you would do—and I’ll stop a mistake before you save it.";
export const FIRST_MESSAGE_TUTOR_EN =
  "Hi, I'm Marta. I learned this job by watching the architect work. Go ahead with your case: before the key steps I'll ask what you'd do, and if you're about to slip, I'll stop you.";

const BASE = `You are Marta Ricci, 24, an architecture graduate student specialising in building design at Politecnico di Milano. You have interned for three weeks with a senior architect. You are curious, humble and precise. You worry that a wrong dimension could reach a building site because nobody told you to check it. You carry a squared notebook and often say “Wait, let me write that down” or “If I understand correctly…”.
Speak in English, warmly and naturally. Keep turns short, at most 20 words. You're a person, not a virtual assistant: no lists or generic offers of help. Admit uncertainty and never invent rules. Use only what the expert said or what trusted [SYSTEM] updates report. [SYSTEM] messages are app instructions, not user speech; do not respond unless explicitly told to speak. Remember screen updates silently.`;

export const MODE_CAPTURE = `${BASE}
MODE: WATCH THE MASTER. NEVER speak while the architect works. Speak only after a [SYSTEM] PAUSE message.
PAUSE: ask ONE short question about WHY a particular action or sketch was made. Name the action naturally.
PAUSE GUARDRAIL: ask ONE question about limits: when not to do it, or when to stop and ask someone.
After the expert answers, acknowledge in six words or fewer, then stay quiet. If the expert thinks aloud, use skip_turn. Answer briefly if addressed directly.`;

export const MODE_DEBRIEF = `${BASE}
MODE: DEBRIEF. Ask three questions about things you saw but the architect did not explain, one at a time, only when [SYSTEM] QUESTION supplies one. Paraphrase without changing the meaning. React briefly.
When [SYSTEM] TEACH-BACK arrives, explain the process in your own words using the supplied text, ending “Did I understand correctly?” If corrected, thank the expert and repeat the corrected part.`;

export function modeTutor(map: WorkMap, lang: "it" | "en" = "en") {
  const steps = lang === "en" && map.en ? map.en.steps : null;
  return `${BASE}
MODE: VOICE TUTOR. Speak in ${lang === "en" ? "English" : "Italian"}. You learned from architect ${map.expert} and now teach a new colleague on a different case. You are still Marta, now more confident.
Your Work Map: ${JSON.stringify(map.steps.map((s, i) => ({ action: steps?.[i]?.action ?? s.action, decision: steps?.[i]?.decision ?? s.decision, why: steps?.[i]?.reason_quote ?? s.reason_quote, guardrails: s.guardrails.map((g, j) => steps?.[i]?.guardrails[j]?.rule ?? g.rule) })))}
Stay quiet while the colleague works correctly. Speak only on [SYSTEM] PREDICTION, BLOCK, CONFIRM, FEEDBACK or VERIFY.
BLOCK: stop the save, replay the expert's moment, explain why in the expert's own words, then ask what to do next. Four sentences maximum.
CONFIRM: praise the correction in one sentence.
PREDICTION: ask the supplied question, then listen; do not give away the answer.
FEEDBACK: deliver the supplied feedback naturally in one or two sentences.
VERIFY: ask the supplied check question and judge the answer against the Work Map.
Answer direct questions only from the Work Map; otherwise say you haven't learned that yet. Use skip_turn if the colleague talks to themselves while working.`;
}

export const DEMO_EXPERT = "Arch. Giulia Bellini";

// Mappa dimostrativa: pronta per mostrare il Voice Tutor anche senza una sessione registrata
export const DEMO_MAP: WorkMap = {
  title: "Chiusura tavole per consegna — Villa Horizon",
  expert: DEMO_EXPERT,
  apprentice: "Marta Ricci",
  summary:
    "Prima di emettere una tavola Bellini controlla tre cose che nessun manuale scrive: che la revisione coincida con quella della pianta collegata, che l'interrato passi dalla Direzione Lavori e che il giardino non finisca mai in fase Permesso.",
  demo: true,
  en: {
    title: "Closing the drawings for delivery — Villa Horizon",
    summary:
      "Before issuing a drawing, Bellini checks three things no manual spells out: that the revision matches the linked floor plan, that the basement goes through the Site Manager, and that the garden never ends up in the Permit phase.",
    steps: [
      {
        id: "d1",
        action: "Moves the South Elevation from rev A to rev B",
        decision: "Aligns the elevation's revision with the floor plan's",
        reason_quote: "If the plan is at B and the elevation at A, someone on site builds from two different versions. I align them first, then I issue.",
        guardrails: [{ rule: "Never issue a sheet whose revision differs from its linked sheets.", reason_quote: "If the plan is at B and the elevation at A, someone on site builds from two different versions." }],
      },
      {
        id: "d2",
        action: "Sets the Basement plan to second approval",
        decision: "Sends the basement to the Site Manager before issuing it",
        reason_quote: "The basement has the foundations and the excavation. A mistake there costs ten times more. It always goes past a second pair of eyes, even when I'm in a hurry.",
        guardrails: [{ rule: "The basement plan is never issued without a second approval.", reason_quote: "The basement has the foundations and the excavation. A mistake there costs ten times more." }],
      },
      {
        id: "d3",
        action: "Moves Garden and outbuildings from Permit phase to Executive phase",
        decision: "The garden goes in the Executive phase, never in Permit",
        reason_quote: "If the garden goes in Permit, the Council reads it as a design variant and reopens the whole file. I keep it for the executive phase.",
        guardrails: [{ rule: "The garden is never in the Permit phase.", reason_quote: "If the garden goes in Permit, the Council reads it as a design variant and reopens my whole file." }],
      },
      {
        id: "d4",
        action: "Puts a doubtful sheet on hold",
         decision: "If a sheet is on hold she doesn't issue it, not even as a courtesy to the client",
        reason_quote: "On hold means I have a doubt. A doubt doesn't go to the client: first you resolve it.",
        guardrails: [{ rule: "Never issue a sheet that is on hold.", reason_quote: "On hold means I have a doubt. A doubt doesn't go to the client." }],
      },
    ],
  },
  steps: [
    {
      id: "d1",
      t: 18,
      frameUrl: "/demo/PlaceholderProspettosud.png",
      action: "Porta il Prospetto Sud da rev A a rev B",
      decision: "Allinea la revisione del prospetto a quella della pianta",
      reason_quote:
        "Se la pianta è in B e il prospetto è in A, in cantiere qualcuno costruisce con due versioni diverse. Prima li allineo, poi emetto.",
      guardrails: [
        { rule: "Mai emettere un foglio con revisione diversa da quella dei fogli collegati.", check: { kind: "rev_mismatch" }, t: 18, frameUrl: "/demo/PlaceholderProspettosud.png", reason_quote: "Se la pianta è in B e il prospetto è in A, in cantiere qualcuno costruisce con due versioni diverse." },
      ],
      confidence: 0.92,
    },
    {
      id: "d2",
      t: 46,
      frameUrl: "/demo/PlaceholderPianoInterrato.png",
      action: "Imposta il Piano interrato in seconda approvazione",
      decision: "Manda l'interrato alla Direzione Lavori prima di emetterlo",
      reason_quote:
        "L'interrato ha le fondazioni e gli scavi. Un errore lì costa dieci volte. Passa sempre da un secondo paio d'occhi, anche se ho fretta.",
      guardrails: [
        { rule: "Il piano interrato non si emette mai senza seconda approvazione.", check: { kind: "second_approval", tag: "interrato" }, t: 46, frameUrl: "/demo/PlaceholderPianoInterrato.png", reason_quote: "L'interrato ha le fondazioni e gli scavi. Un errore lì costa dieci volte." },
      ],
      confidence: 0.9,
    },
    {
      id: "d3",
      t: 77,
      frameUrl: "/demo/PlaceholderGiardinoePertinenze.png",
      action: "Sposta Giardino e pertinenze da fase Permesso a fase Esecutivo",
      decision: "Il giardino va in fase Esecutivo, mai in Permesso",
      reason_quote:
        "Se il giardino va in Permesso il Comune lo legge come variante di progetto, e mi riapre tutta la pratica. Lo tengo per l'esecutivo.",
      guardrails: [
        { rule: "Il giardino non va mai in fase Permesso.", check: { kind: "phase_forbidden", tag: "giardino", phase: "Permesso" }, t: 77, frameUrl: "/demo/PlaceholderGiardinoePertinenze.png", reason_quote: "Se il giardino va in Permesso il Comune lo legge come variante di progetto, e mi riapre tutta la pratica." },
      ],
      confidence: 0.88,
    },
    {
      id: "d4",
      t: 104,
      frameUrl: "/demo/piano_terra2.png",
      action: "Sospende l'approvazione di un foglio dubbio",
       decision: "Se un foglio è sospeso non lo emette, nemmeno per cortesia al cliente",
      reason_quote: "Sospeso vuol dire che ho un dubbio. Un dubbio non si manda al cliente: prima si scioglie.",
      guardrails: [{ rule: "Mai emettere un foglio sospeso.", check: { kind: "no_issue_if_held" }, t: 104, frameUrl: "/demo/piano_terra2.png", reason_quote: "Sospeso vuol dire che ho un dubbio. Un dubbio non si manda al cliente." }],
      confidence: 0.85,
    },
  ],
};
