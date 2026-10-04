import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { MartaAvatar } from "@/components/app/MartaAvatar";
import { TavoleViewer } from "@/components/app/TavoleViewer";
import { TestsChecklist } from "@/components/app/TestsChecklist";
import { useMarta } from "@/hooks/useMarta";
import { useExpertMic } from "@/hooks/useExpertMic";
import { applyAction, describeAction } from "@/lib/caseReducer";
import { NEWHIRE_CASE, newHireInitial } from "@/lib/sheets";
import { findViolation, safetyNetViolation, hasCustomGuardrails, type Violation } from "@/lib/guardrails";
import { patchSession, uid, useAppSession } from "@/lib/store";
import { DEMO_MAP, FIRST_MESSAGE_TUTOR, FIRST_MESSAGE_TUTOR_EN, MOOD_LABEL, modeTutor, type Mood } from "@/lib/persona";
import { buildMasteryReport, evaluateLearning, evaluatePrediction, judgeAction, tutorVerifyQuestion } from "@/lib/apprentice.functions";
import { saveSession } from "@/lib/sessions.functions";
import type { Lang, MasteryReport, Prediction, TutorAttempt, UiAction, WorkMap, WorkMapStep } from "@/lib/types";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const T = {
  it: {
    predQ: "Secondo te cosa va fatto adesso, e perché?",
    stop: "Stop: non salvo ancora",
    replay: "Rivediamo il momento dell'esperto",
    expert: "L'esperto diceva",
    fix: "Ho capito, correggo",
    answer: "Rispondi",
    cont: "Continua",
    mastered: "Padroneggiato",
    practice: "Da esercitare",
    next: "Prossimo esercizio consigliato",
  },
  en: {
    predQ: "In your opinion, what should be done now, and why?",
    stop: "Stop: I'm not saving yet",
    replay: "Let's replay the expert's moment",
    expert: "The expert said",
    fix: "Got it, I'll fix it",
    answer: "Answer",
    cont: "Continue",
    mastered: "Mastered",
    practice: "To practise",
    next: "Recommended next exercise",
  },
} as const;

/** Quale passaggio della Work Map riguarda questa azione del nuovo assunto? */
function relatedStep(a: UiAction, map: WorkMap, done: Set<string>): WorkMapStep | null {
  if (a.type === "select" || a.type === "annotate" || a.type === "sketch") return null;
  const tag = NEWHIRE_CASE.find((s) => s.id === a.sheetId)?.tag;
  for (const st of map.steps) {
    if (done.has(st.id)) continue;
    for (const g of st.guardrails) {
      const c = g.check;
      if (c.tag && c.tag === tag) return st;
      if (c.kind === "rev_mismatch" && (a.type === "rev" || a.type === "issue")) return st;
      if (c.kind === "no_issue_if_held" && (a.type === "issue" || (a.type === "approval" && a.value === "held"))) return st;
    }
  }
  return null;
}

interface Gate {
  action: UiAction;
  step: WorkMapStep;
  answer: string;
  phase: "ask" | "eval" | "feedback";
  feedback?: string;
  score?: number;
}
interface Block {
  v: Violation;
  stepIdx: number;
  gIdx: number;
}

export function TutorSession() {
  const s = useAppSession();
  const map: WorkMap = s.workMap ?? DEMO_MAP;
  const [lang, setLang] = useState<Lang>("en");
  const tt = T[lang];
  const [state, setState] = useState(newHireInitial);
  const [selectedId, setSelectedId] = useState(NEWHIRE_CASE[0]!.id);
  const [started, setStarted] = useState(false);
  const [gate, setGate] = useState<Gate | null>(null);
  const [block, setBlock] = useState<Block | null>(null);
  const [attempts, setAttempts] = useState<TutorAttempt[]>([]);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [typed, setTyped] = useState("");
  const [lines, setLines] = useState<{ id: string; who: "marta" | "nuovo"; text: string }[]>([]);
  const [stage, setStage] = useState<"work" | "verify-load" | "verify" | "eval" | "report">("work");
  const [vq, setVq] = useState("");
  const [vAnswer, setVAnswer] = useState("");
  const [report, setReport] = useState<MasteryReport | null>(null);
  const [final, setFinal] = useState<{ score: number; verdict: string } | null>(null);
  const textMode = useRef(false);
  const [textOnly, setTextOnly] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const gateRef = useRef<Gate | null>(null);
  gateRef.current = gate;
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const attemptsRef = useRef(attempts);
  attemptsRef.current = attempts;
  const predsRef = useRef(preds);
  predsRef.current = preds;
  const t0 = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const doPredict = useServerFn(evaluatePrediction);
  const doJudge = useServerFn(judgeAction);
  const doVerify = useServerFn(tutorVerifyQuestion);
  const doEval = useServerFn(evaluateLearning);
  const doReport = useServerFn(buildMasteryReport);
  const doSave = useServerFn(saveSession);

  const say = useCallback((who: "marta" | "nuovo", text: string) => setLines((l) => [...l, { id: uid(), who, text }]), []);
  const marta = useMarta({
    onMarta: (t) => {
      if (!textMode.current) say("marta", t);
    },
  });
  const heard = useCallback(
    (text: string) => {
      say("nuovo", text);
      if (gateRef.current?.phase === "ask") setGate((g) => (g ? { ...g, answer: `${g.answer} ${text}`.trim() } : g));
      else if (stageRef.current === "verify") setVAnswer((a) => `${a} ${text}`.trim());
    },
    [say],
  );
  const mic = useExpertMic({ onSpeech: () => undefined, onCommitted: (t) => !marta.speaking && heard(t) }, lang);

  const stepsText = (l: Lang, i: number) => (l === "en" ? map.en?.steps[i] : undefined);
  const rules = map.steps.flatMap((st) => st.guardrails.map((g) => g.rule));
  const attemptsText = () =>
    attemptsRef.current.map((a) => `${a.blocked ? "BLOCCATO" : "ok"} ${a.sheetId}${a.guardrail ? ` — ${a.guardrail}` : ""}`).join("\n") || "(nessun tentativo)";

  const start = async () => {
    setStarted(true);
    t0.current = Date.now();
    const first = lang === "en" ? FIRST_MESSAGE_TUTOR_EN : FIRST_MESSAGE_TUTOR;
    const [ok] = await Promise.all([marta.start({ prompt: modeTutor(map, lang), firstMessage: first, language: lang }), mic.start()]);
    if (!ok) {
      textMode.current = true;
      setTextOnly(true);
      say("marta", first);
      toast.message("Marta’s voice is unavailable: she’ll write instead");
    }
  };

  const commit = useCallback(
    (a: UiAction) => {
      setState((st) => applyAction(st, a));
      marta.context(describeAction(a, NEWHIRE_CASE));
    },
    [marta],
  );

  /** Ogni azione del nuovo assunto passa da qui: previsione prima, controllo guardrail prima di "Emetti". */
  const dispatch = async (a: UiAction) => {
    if (!started || stage !== "work") return;
    if (a.type === "select" || a.type === "sketch") return commit(a);
    const done = new Set(predsRef.current.map((p) => p.stepId));
    const st = relatedStep(a, map, done);
    if (st) {
      const q: string = tt.predQ;
      setGate({ action: a, step: st, answer: "", phase: "ask" });
      if (textMode.current) say("marta", q);
      marta.cue(`PREDICTION: the colleague is about to take a key step. Ask in ${lang === "en" ? "English" : "Italian"}: "${q}"`);
      return;
    }
    await finishAction(a);
  };

  const finishAction = async (a: UiAction) => {
    if (a.type !== "issue") return commit(a);
    const st = stateRef.current;
    let v: Violation | null = safetyNetViolation(a.sheetId, NEWHIRE_CASE, st, map) ?? findViolation(a.sheetId, NEWHIRE_CASE, st, map);
    if (!v && hasCustomGuardrails(map)) {
      try {
        const sheet = NEWHIRE_CASE.find((x) => x.id === a.sheetId)!;
        const cur = st[a.sheetId]!;
        const j = await doJudge({ data: { rules, situation: `Foglio ${sheet.title} (${sheet.tag}), rev ${cur.rev}, fase ${cur.phase}, approvazione ${cur.approval}. Sta per emetterlo.` } });
        if (j.violates && j.ruleIndex != null && rules[j.ruleIndex]) {
          const flat = map.steps.flatMap((step) => step.guardrails.map((g) => ({ step, g })));
          const hit = flat[j.ruleIndex];
          if (hit) v = { guardrail: hit.g, step: hit.step, why: j.why };
        }
      } catch (e) {
        console.error(e);
      }
    }
    const tS = (Date.now() - t0.current) / 1000;
    if (v) {
      const stepIdx = map.steps.indexOf(v.step);
      const gIdx = v.step.guardrails.indexOf(v.guardrail);
      setAttempts((l) => [...l, { t: tS, sheetId: a.sheetId, blocked: true, guardrail: v!.guardrail.rule, stepId: v!.step.id }]);
      setBlock({ v, stepIdx, gIdx });
      const quote = stepsText(lang, stepIdx)?.guardrails[gIdx]?.reason_quote ?? v.guardrail.reason_quote;
      const rule = stepsText(lang, stepIdx)?.guardrails[gIdx]?.rule ?? v.guardrail.rule;
      if (textMode.current) say("marta", `${tt.stop}. ${rule} — ${tt.expert}: «${quote}»`);
      marta.cue(
        `BLOCK: you stopped the sheet before saving. Rule broken: "${rule}". Expert at ${fmt(v.guardrail.t)}: "${quote}". Reply in ${lang === "en" ? "English" : "Italian"}.`,
      );
      return;
    }
    setAttempts((l) => [...l, { t: tS, sheetId: a.sheetId, blocked: false }]);
    commit(a);
  };

  const submitPrediction = async () => {
    if (!gate || gate.answer.trim().length < 3) return;
    const g = gate;
    setGate({ ...g, phase: "eval" });
    const i = map.steps.indexOf(g.step);
    const e = stepsText(lang, i);
    try {
      const r = await doPredict({
        data: {
          lang,
          step: {
            action: e?.action ?? g.step.action,
            decision: e?.decision ?? g.step.decision,
            reason_quote: e?.reason_quote ?? g.step.reason_quote,
            guardrails: g.step.guardrails.map((x, j) => e?.guardrails[j]?.rule ?? x.rule),
          },
          answer: g.answer,
        },
      });
      const score = Math.max(0, Math.min(100, Math.round(r.score)));
      setPreds((p) => [...p, { stepId: g.step.id, question: tt.predQ, answer: g.answer, score, feedback: r.feedback }]);
      setGate({ ...g, phase: "feedback", feedback: r.feedback, score });
      if (textMode.current) say("marta", r.feedback);
      marta.cue(`FEEDBACK: say naturally in ${lang === "en" ? "English" : "Italian"}: "${r.feedback}"`);
    } catch (err) {
      console.error(err);
      toast.error("Could not check the answer");
      setGate({ ...g, phase: "ask" });
    }
  };

  const continueAfterGate = async () => {
    const g = gate;
    setGate(null);
    if (g) await finishAction(g.action);
  };

  const submitTyped = () => {
    const t = typed.trim();
    if (!t) return;
    setTyped("");
    heard(t);
  };

  const conclude = async () => {
    setStage("verify-load");
    try {
      const r = await doVerify({ data: { rules, attempts: attemptsText(), lang } });
      setVq(r.question);
      setVAnswer("");
      setStage("verify");
      if (textMode.current) say("marta", r.question);
      marta.cue(`VERIFY: ask the colleague in ${lang === "en" ? "English" : "Italian"}: "${r.question}"`);
    } catch (e) {
      console.error(e);
      toast.error("Check unavailable");
      setStage("work");
    }
  };

  const submitVerify = async () => {
    if (vAnswer.trim().length < 3) return;
    setStage("eval");
    try {
      const ev = await doEval({ data: { rules, question: vq, answer: vAnswer, attempts: attemptsText(), lang } });
      const score = Math.max(0, Math.min(100, Math.round(ev.score)));
      setFinal({ score, verdict: ev.verdict });
      const rep = await doReport({
        data: {
          lang,
          steps: map.steps.map((st) => ({ id: st.id, action: st.action, guardrails: st.guardrails.map((g) => g.rule) })),
          predictions: predsRef.current.map((p) => ({ stepId: p.stepId, score: p.score, feedback: p.feedback })),
          attempts: attemptsRef.current.map((a) => ({ stepId: a.stepId, guardrail: a.guardrail, blocked: a.blocked })),
          finalAnswer: vAnswer,
          finalScore: score,
        },
      });
      const full: MasteryReport = {
        nextExercise: rep.nextExercise,
        steps: map.steps.map((st, i) => {
          const r = rep.steps.find((x) => x.stepId === st.id);
          return { stepId: st.id, label: stepsText(lang, i)?.action ?? st.action, status: r?.status ?? "practice", note: r?.note ?? "" };
        }),
        guardrails: map.steps.flatMap((st, i) =>
          st.guardrails.map((g, j) => {
            const r = rep.guardrails.find((x) => x.rule === g.rule || (x.stepId === st.id && x.rule === (stepsText(lang, i)?.guardrails[j]?.rule ?? "")));
            return { rule: stepsText(lang, i)?.guardrails[j]?.rule ?? g.rule, stepId: st.id, status: r?.status ?? "practice", note: r?.note ?? "" };
          }),
        ),
      };
      setReport(full);
      setStage("report");
      patchSession({
        tutorAttempts: attemptsRef.current,
        tutorScore: { score, verdict: ev.verdict },
        tutorPredictions: predsRef.current,
        tutorReport: full,
      });
      const saved = await doSave({
        data: {
          kind: "tutor",
          title: `Voice Tutor · ${map.title}`,
          person: "New hire",
          events: [],
          questions: [],
          transcript: lines.map((l, i) => ({ id: l.id, t: i, who: l.who, text: l.text })),
          workMap: null,
          teachbackConfirmed: getTb(),
          tests: {},
          score: { score, verdict: ev.verdict, attempts: attemptsRef.current, predictions: predsRef.current, report: full },
        },
      });
      patchSession({ tutorSavedId: saved.id });
      await marta.end();
      mic.stop();
    } catch (e) {
      console.error(e);
      toast.error("Could not finish the case. Try again.");
      setStage("verify");
    }
  };
  const getTb = () => s.teachbackConfirmed;

  useEffect(() => () => void 0, []);

  const issuedCount = Object.values(state).filter((x) => x.issued).length;
  const mood: Mood = marta.speaking ? "speaking" : block ? "alert" : gate ? "question" : stage !== "work" ? "thinking" : started ? "listening" : "idle";
  const stepStatus = (id: string) => preds.find((p) => p.stepId === id);
  const blocked = (id: string) => attempts.some((a) => a.stepId === id && a.blocked);

  return (
    <AppShell wide>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Module 03 · Teach</div>
          <h1 className="text-3xl">Voice Tutor</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="label">Tutor language</span>
            <div className="flex border" data-testid="lang-switch">
              {(["en", "it"] as Lang[]).map((l) => (
                <button
                  key={l}
                  disabled={started || (l === "en" && !map.en)}
                  onClick={() => setLang(l)}
                  className={`px-3 py-2 text-[0.7rem] font-bold uppercase ${lang === l ? "bg-foreground text-background" : "hover:bg-secondary"} disabled:opacity-40`}
                >
                  {l === "it" ? "Italian" : "English"}
                </button>
              ))}
            </div>
          </div>
          {!started && (
            <button className="btn btn-primary" onClick={start} data-testid="btn-tutor-start">
              Start case
            </button>
          )}
          {started && stage === "work" && (
            <button className="btn btn-primary" onClick={conclude} disabled={!!gate || !!block} data-testid="btn-conclude">
              Finish case ({issuedCount}/{NEWHIRE_CASE.length})
            </button>
          )}
        </div>
      </div>

      {!s.workMap && (
        <div className="mb-4 frame px-4 py-3 text-sm">No recorded Work Map: Marta is teaching from the sample map ({map.expert}).</div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0 space-y-4">
          <div className="frame p-3 text-xs">
            <span className="label">Your case</span>
            <p className="mt-1 leading-relaxed">
              Finish and issue the drawings for the new project (Building 2). Marta learned from {map.expert}: she’ll ask what you would do before key steps and stop an incorrect save.
            </p>
          </div>
          <TavoleViewer
            sheets={NEWHIRE_CASE}
            state={state}
            selectedId={selectedId}
            onSelect={setSelectedId}
            dispatch={dispatch}
            canvasRef={canvasRef}
            disabled={!started || stage !== "work" || !!gate || !!block}
            issueLabel={"Issue sheet"}
          />

          {gate && (
            <div className="frame border-[var(--color-accent)] p-4" data-testid="prediction-card">
              <div className="label text-[var(--color-accent)]">{"Before you continue"}</div>
              <p className="mt-1 text-lg font-bold leading-snug">{tt.predQ}</p>
              {gate.phase !== "feedback" ? (
                <>
                  <textarea
                    value={gate.answer}
                    onChange={(e) => setGate({ ...gate, answer: e.target.value })}
                    rows={3}
                    placeholder={"Say it aloud or write here…"}
                    className="mt-3 w-full border bg-card p-2 text-xs"
                    data-testid="prediction-answer"
                  />
                  <button className="btn btn-primary mt-2" onClick={submitPrediction} disabled={gate.phase === "eval" || gate.answer.trim().length < 3} data-testid="btn-predict">
                    {gate.phase === "eval" ? "…" : tt.answer}
                  </button>
                </>
              ) : (
                <div className="mt-3 space-y-2 text-sm" data-testid="prediction-feedback">
                  <div className="label">Compared with the Work Map · {gate.score}/100</div>
                  <p>{gate.feedback}</p>
                  <button className="btn btn-primary" onClick={continueAfterGate} data-testid="btn-gate-continue">
                    {tt.cont}
                  </button>
                </div>
              )}
            </div>
          )}

          {stage === "verify" && (
            <div className="frame p-4" data-testid="verify-card">
              <div className="label">{"Check"}</div>
              <p className="mt-1 text-lg font-bold leading-snug">{vq}</p>
              <textarea value={vAnswer} onChange={(e) => setVAnswer(e.target.value)} rows={3} className="mt-3 w-full border bg-card p-2 text-xs" data-testid="verify-answer" />
              <button className="btn btn-primary mt-2" onClick={submitVerify} disabled={vAnswer.trim().length < 3}>
                {tt.answer}
              </button>
            </div>
          )}
          {(stage === "verify-load" || stage === "eval") && <div className="frame p-4 text-sm">Marta is thinking…</div>}

          {stage === "report" && report && final && <ReportCard report={report} final={final} tt={tt} />}
        </section>

        <aside className="space-y-4">
          <div className="frame" data-testid="marta-panel">
            <div className="flex items-center gap-4 p-4">
              <MartaAvatar size={84} mood={mood} />
              <div>
                <div className="font-[family-name:var(--font-display)] text-xl font-extrabold uppercase leading-none">Marta</div>
                <div className="label mt-1">Voice Tutor · {lang === "en" ? "English" : "Italian"}</div>
                <div className="mt-2 inline-block border px-2 py-0.5 text-[0.65rem] font-bold uppercase">{MOOD_LABEL[mood]}</div>
              </div>
            </div>
            <div className="border-t px-4 py-2 text-[0.7rem]">
              {!started ? "Ready when you are." : textOnly || marta.error ? "Text only" : marta.connected ? "Voice connected (ElevenAgents)" : "Connecting…"}
              {started && ` · ${mic.connected ? "Scribe v2 listening" : "Scribe inactive"}`}
            </div>
          </div>

          <div className="frame">
            <div className="border-b px-3 py-2 label">Key steps · prediction</div>
            <ul className="divide-y" data-testid="tutor-steps">
              {map.steps.map((st, i) => {
                const p = stepStatus(st.id);
                return (
                  <li key={st.id} className="flex gap-3 px-3 py-2 text-xs">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center border text-[0.65rem] font-bold ${p ? "bg-foreground text-background" : ""}`}>{i + 1}</span>
                    <div className="min-w-0">
                      <div className="font-bold leading-snug">{stepsText(lang, i)?.action ?? st.action}</div>
                      <div className="label">
                        {p ? `${p.score}/100` : "—"} {blocked(st.id) && <span className="text-[var(--color-accent)]">· blocked</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="frame">
            <div className="border-b px-3 py-2 label">Conversation</div>
            <ul className="max-h-56 space-y-2 overflow-auto p-3 text-xs" data-testid="tutor-transcript">
              {lines.length === 0 && <li className="opacity-60">Marta speaks at key steps only.</li>}
              {lines.map((l) => (
                <li key={l.id} className={l.who === "marta" ? "border-l-2 border-[var(--color-accent)] pl-2" : ""}>
                  <span className="label mr-1">{l.who}</span>
                  {l.text}
                </li>
              ))}
              {mic.partial && <li className="opacity-50">{mic.partial}…</li>}
            </ul>
            {started && (
              <div className="flex gap-2 border-t p-2">
                <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitTyped()} placeholder={"Type an answer…"} className="min-w-0 flex-1 border bg-card px-2 py-1.5 text-xs" />
                <button className="btn" onClick={submitTyped}>
                  Send
                </button>
              </div>
            )}
          </div>
          <TestsChecklist compact />
        </aside>
      </div>

      {block && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4" data-testid="block-modal">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-auto border-2 border-[var(--color-accent)] bg-background">
            <div className="flex items-center gap-3 bg-[var(--color-accent)] px-4 py-3 text-[var(--color-accent-foreground)]">
              <MartaAvatar size={44} mood="alert" />
              <h2 className="text-xl text-[var(--color-accent-foreground)]">{tt.stop}</h2>
            </div>
            <div className="grid gap-0 md:grid-cols-2">
              <div className="border-b bg-secondary md:border-b-0 md:border-r">
                {block.v.guardrail.frameUrl && <img src={block.v.guardrail.frameUrl} alt="" className="aspect-[8/5] w-full object-contain" />}
                <div className="label border-t px-3 py-1.5">
                  {tt.replay} · t={fmt(block.v.guardrail.t)}
                </div>
              </div>
              <div className="space-y-3 p-4 text-sm">
                <p className="font-bold">{stepsText(lang, block.stepIdx)?.guardrails[block.gIdx]?.rule ?? block.v.guardrail.rule}</p>
                <div>
                  <div className="label">{tt.expert}</div>
                  <blockquote className="mt-1 border-l-4 border-[var(--color-accent)] pl-3 italic leading-relaxed">
                    «{stepsText(lang, block.stepIdx)?.guardrails[block.gIdx]?.reason_quote ?? block.v.guardrail.reason_quote}»
                  </blockquote>
                </div>
                <p className="text-xs opacity-70">{block.v.why}</p>
              </div>
            </div>
            <div className="border-t p-3">
              <button className="btn btn-primary" onClick={() => setBlock(null)} data-testid="btn-block-ok">
                {tt.fix}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ReportCard({ report, final, tt }: { report: MasteryReport; final: { score: number; verdict: string }; tt: (typeof T)["it"] | (typeof T)["en"] }) {
  const Row = ({ status, title, note }: { status: "mastered" | "practice"; title: string; note: string }) => (
    <li className="flex gap-3 border-b p-3 last:border-b-0">
      <span className={`mt-0.5 h-fit shrink-0 border px-2 py-0.5 text-[0.6rem] font-bold uppercase ${status === "mastered" ? "bg-foreground text-background" : "border-[var(--color-accent)] text-[var(--color-accent)]"}`}>
        {status === "mastered" ? tt.mastered : tt.practice}
      </span>
      <div className="text-xs">
        <div className="font-bold leading-snug">{title}</div>
        <div className="mt-0.5 opacity-70">{note}</div>
      </div>
    </li>
  );
  return (
    <div className="frame" data-testid="mastery-report">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <div className="label">Final report</div>
          <p className="mt-1 max-w-xl text-sm">{final.verdict}</p>
        </div>
        <div className="font-[family-name:var(--font-display)] text-5xl font-extrabold">{final.score}</div>
      </div>
      <div className="grid md:grid-cols-2">
        <div className="md:border-r">
          <div className="label border-b px-3 py-2">Steps</div>
          <ul>{report.steps.map((x) => <Row key={x.stepId} status={x.status} title={x.label} note={x.note} />)}</ul>
        </div>
        <div>
          <div className="label border-b px-3 py-2">Guardrail</div>
          <ul>{report.guardrails.map((x, i) => <Row key={i} status={x.status} title={x.rule} note={x.note} />)}</ul>
        </div>
      </div>
      <div className="border-t bg-secondary p-4">
        <div className="label">{tt.next}</div>
        <p className="mt-1 text-sm font-bold">{report.nextExercise}</p>
      </div>
    </div>
  );
}
