import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/app/AppShell";
import { MartaAvatar } from "@/components/app/MartaAvatar";
import { TavoleViewer, VIEWER_PII_BOXES } from "@/components/app/TavoleViewer";
import { TestsChecklist } from "@/components/app/TestsChecklist";
import { useMarta } from "@/hooks/useMarta";
import { useExpertMic } from "@/hooks/useExpertMic";
import { useCaptureEngine, type CapturedEvent } from "@/hooks/useCaptureEngine";
import { applyAction, describeAction } from "@/lib/caseReducer";
import { EXPERT_CASE, expertInitial } from "@/lib/sheets";
import { getSession, patchSession, resetSession, uid, useAppSession } from "@/lib/store";
import { DEMO_EXPERT, FIRST_MESSAGE_CAPTURE, FIRST_MESSAGE_DEBRIEF, MODE_CAPTURE, MODE_DEBRIEF, MOOD_LABEL, type Mood } from "@/lib/persona";
import { buildTeachBack, buildWorkMap, pickDebriefQuestions, translateWorkMap } from "@/lib/apprentice.functions";
import { saveSession } from "@/lib/sessions.functions";
import type { CaptureEvent, UiAction, WorkMap } from "@/lib/types";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const lowerFirst = (s: string) => (s ? s[0]!.toLowerCase() + s.slice(1) : s);
const slim = (e: CaptureEvent) => ({ id: e.id, t: e.t, action: e.action, summary: e.summary, significance: e.significance, explained: e.explained });

interface OpenQ {
  id: string;
  text: string;
  kind: "why" | "guardrail";
  eventId: string | null;
  answer: string;
  answeredAt: number;
  askedAt: number;
}

type Stage = "idle" | "capture" | "dq-load" | "dq" | "tb-load" | "tb" | "build";

export function WatchSession() {
  const s = useAppSession();
  const navigate = useNavigate();
  const [caseState, setCaseState] = useState(expertInitial);
  const [selectedId, setSelectedId] = useState(EXPERT_CASE[0]!.id);
  const [source, setSource] = useState<"tavole" | "screen">("tavole");
  const [offRecord, setOffRecord] = useState(false);
  const [openQ, setOpenQ] = useState<OpenQ | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [expertName, setExpertName] = useState(DEMO_EXPERT);
  const [stage, setStage] = useState<Stage>("idle");
  const [dq, setDq] = useState<{ eventId: string; text: string }[]>([]);
  const [dqIdx, setDqIdx] = useState(0);
  const [dqAnswer, setDqAnswer] = useState("");
  const [teachBack, setTeachBack] = useState("");
  const [correction, setCorrection] = useState("");
  const [buildMsg, setBuildMsg] = useState("");
  const corrRef = useRef("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const actionsBuf = useRef<string[]>([]);
  const lastHint = useRef("");
  const drawingRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const lastSpeechAt = useRef(Date.now());
  const lastQAt = useRef(0);
  const openQRef = useRef<OpenQ | null>(null);
  openQRef.current = openQ;
  const stageRef = useRef<Stage>(stage);
  stageRef.current = stage;
  const offRef = useRef(false);
  offRef.current = offRecord;
  const dqAnswerRef = useRef("");
  dqAnswerRef.current = dqAnswer;
  const scribeOk = useRef(false);
  const textMode = useRef(false);
  const [textOnly, setTextOnly] = useState(false);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const pickQs = useServerFn(pickDebriefQuestions);
  const doTeach = useServerFn(buildTeachBack);
  const doMap = useServerFn(buildWorkMap);
  const doTranslate = useServerFn(translateWorkMap);
  const doSave = useServerFn(saveSession);

  const tSec = () => (getSession().startedAt ? (Date.now() - getSession().startedAt!) / 1000 : 0);

  const addLine = useCallback((who: "esperto" | "marta", text: string) => {
    patchSession((cur) => ({ transcript: [...cur.transcript, { id: uid(), t: cur.startedAt ? (Date.now() - cur.startedAt) / 1000 : 0, who, text }] }));
  }, []);

  /** Un parlato dell'esperto (Scribe v2) viene attribuito alla domanda aperta, se c'è. */
  const handleExpertSpeech = useCallback(
    (text: string) => {
      if (offRef.current) return;
      lastSpeechAt.current = Date.now();
      addLine("esperto", text);
      const q = openQRef.current;
      if (stageRef.current === "capture" && q) {
        const answer = `${q.answer} ${text}`.trim();
        setOpenQ({ ...q, answer, answeredAt: Date.now() });
      }
      if (stageRef.current === "dq") setDqAnswer((a) => `${a} ${text}`.trim());
      if (stageRef.current === "tb") setCorrection((c) => c); // la correzione vocale si dice a Marta; il testo si scrive a mano
    },
    [addLine],
  );

  const marta = useMarta({
    onMarta: (t) => {
      if (!textMode.current) addLine("marta", t);
    },
    onHeard: (t) => {
      // fallback: se Scribe non è collegato, usiamo il riconoscimento dell'agente
      if (!scribeOk.current) handleExpertSpeech(t);
    },
  });
  const mic = useExpertMic({
    onSpeech: () => {
      if (!offRef.current) lastSpeechAt.current = Date.now();
    },
    onCommitted: (t) => {
      if (!marta.speaking) handleExpertSpeech(t);
    },
  });
  scribeOk.current = mic.connected;

  const engine = useCaptureEngine({
    running: stage === "capture",
    offRecord,
    getSource: () => (source === "screen" ? videoRef.current : canvasRef.current),
    getKnownPii: () => (source === "tavole" ? VIEWER_PII_BOXES : []),
    getHint: () => {
      lastHint.current = actionsBuf.current.splice(0).join("; ");
      return lastHint.current;
    },
    onBusy: setBusy,
    onDropped: () => patchSession((cur) => ({ droppedFrames: cur.droppedFrames + 1 })),
    onEvent: (e: CapturedEvent) => {
      const ev: CaptureEvent = {
        id: uid(),
        t: tSec(),
        action: e.action,
        summary: e.summary,
        sheetId: source === "tavole" ? selectedRef.current : null,
        significance: e.significance,
        frame: e.frame,
        explained: false,
        sketch: lastHint.current.includes("SCHIZZA"),
      };
      patchSession((cur) => ({ events: [...cur.events, ev], blurredRegions: cur.blurredRegions + e.blurred }));
      marta.context(`${ev.sketch ? "The architect sketched directly on the drawing" : "Sullo schermo"}: ${e.action}. ${e.summary}`);
    },
  });

  // orologio
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  /** Rivelatore di pausa naturale: parla solo se lo schermo e la voce sono fermi da ≥ 4 s. */
  useEffect(() => {
    if (stage !== "capture") return;
    const id = window.setInterval(() => {
      const t = Date.now();
      const cur = getSession();
      const q = openQRef.current;
      if (q) {
        // chiude la domanda quando l'esperto ha risposto e tace, o dopo 75 s
        if ((q.answer.length >= 12 && t - q.answeredAt > 3500) || t - q.askedAt > 75000) {
          if (q.eventId) patchSession({ events: cur.events.map((e) => (e.id === q.eventId && q.answer.length >= 12 ? { ...e, explained: true } : e)) });
          patchSession({ questions: getSession().questions.map((x) => (x.id === q.id ? { ...x, answer: q.answer } : x)) });
          setOpenQ(null);
        }
        return;
      }
      if (offRef.current || marta.speaking || engine.analyzing.current || drawingRef.current) return;
      const screenIdle = t - engine.lastChangeAt.current;
      const speechIdle = t - lastSpeechAt.current;
      if (screenIdle < 4000 || speechIdle < 4000 || t - lastQAt.current < 12000) return;
      if (cur.questions.length >= 6 || cur.events.length === 0) return;
      const asked = new Set(cur.questions.map((x) => x.eventId));
      const fresh = cur.events.filter((e) => !e.explained && !asked.has(e.id));
      const hasGuard = cur.questions.some((x) => x.kind === "guardrail");
      const n = cur.questions.length;
      let ev: CaptureEvent | undefined;
      let kind: "why" | "guardrail" = "why";
      if (!hasGuard && n >= 2) {
        kind = "guardrail";
        ev = fresh[fresh.length - 1] ?? cur.events[cur.events.length - 1];
      } else if (fresh.length) {
        ev = fresh.find((e) => e.sketch) ?? fresh.find((e) => e.significance === "high") ?? fresh[0];
      } else if (n < 3 && !hasGuard) {
        kind = "guardrail";
        ev = cur.events[cur.events.length - 1];
      }
      if (!ev) return;
      const text =
        kind === "guardrail"
          ? "At this step, when would you avoid doing this or ask someone else first?"
          : ev.sketch
            ? `I noticed your sketch: ${lowerFirst(ev.action)}. What were you checking with that mark?`
            : `I noticed that ${lowerFirst(ev.action)}. Why do it now?`;
      const id = uid();
      patchSession({
        questions: [...cur.questions, { id, t: tSec(), kind, text, eventId: ev.id, pauseMs: Math.round(screenIdle), silenceMs: Math.round(speechIdle) }],
      });
      lastQAt.current = t;
      setOpenQ({ id, text, kind, eventId: ev.id, answer: "", answeredAt: 0, askedAt: t });
      if (textMode.current) addLine("marta", text);
      marta.cue(
        `PAUSE${kind === "guardrail" ? " GUARDRAIL" : ""}: the architect has paused for ${Math.round(screenIdle / 1000)} seconds. Event: "${ev.action}". Ask naturally in your own words: "${text}"`,
      );
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, marta.speaking]);

  const dispatch = useCallback(
    (a: UiAction) => {
      setCaseState((st) => applyAction(st, a));
      if (stageRef.current === "capture" && !offRef.current) actionsBuf.current.push(describeAction(a, EXPERT_CASE));
    },
    [],
  );

  // schermo condiviso
  const stopShare = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setSource("tavole");
  }, []);
  const shareScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", stopShare);
      setSource("screen");
      toast.success("Screen shared: Marta is watching");
    } catch {
      toast.error("Screen sharing could not start");
    }
  };
  useEffect(() => {
    if (source === "screen" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => undefined);
    }
  }, [source]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  const begin = async () => {
    resetSession();
    patchSession({ startedAt: Date.now(), phase: "capture" });
    lastSpeechAt.current = Date.now();
    lastQAt.current = 0;
    actionsBuf.current = [];
    setStage("capture");
    const [m, sc] = await Promise.all([marta.start({ prompt: MODE_CAPTURE, firstMessage: FIRST_MESSAGE_CAPTURE, language: "en" }), mic.start()]);
    if (!m) {
      textMode.current = true;
      setTextOnly(true);
      addLine("marta", FIRST_MESSAGE_CAPTURE);
      toast.message("Marta’s voice is unavailable: questions will appear in text");
    }
    if (!sc) toast.message("Voice transcription is unavailable: you can type your answers");
  };

  const toggleOff = () => {
    if (!offRecord) {
      setOffRecord(true);
      patchSession((cur) => ({ offRecordCount: cur.offRecordCount + 1 }));
      setOpenQ(null);
      mic.stop();
      marta.setMuted(true);
      toast("Off record: screen and voice are not read or saved");
    } else {
      setOffRecord(false);
      engine.resetKeyframe();
      lastSpeechAt.current = Date.now();
      marta.setMuted(false);
      void mic.start();
      marta.context("The architect resumed recording. Ignore everything that happened off record.");
    }
  };

  const submitTyped = () => {
    const text = typed.trim();
    if (!text) return;
    setTyped("");
    if (stage === "dq") setDqAnswer((a) => `${a} ${text}`.trim());
    else if (stage === "capture") handleExpertSpeech(text);
  };

  // —— DEBRIEF ——
  const goDebrief = async () => {
    setOpenQ(null);
    patchSession({ phase: "debrief" });
    setStage("dq-load");
    stopShare();
    await marta.end();
    void marta.start({ prompt: MODE_DEBRIEF, firstMessage: FIRST_MESSAGE_DEBRIEF, language: "en" }).then((ok) => {
      if (!ok) textMode.current = true;
    });
    const cur = getSession();
    try {
      const r = await pickQs({
        data: {
          events: cur.events.map(slim),
          transcript: cur.transcript.map((l) => ({ t: l.t, who: l.who, text: l.text })),
          asked: cur.questions.map((q) => q.text),
        },
      });
      const qs = r.questions.length ? r.questions : [];
      while (qs.length < 3) qs.push({ eventId: "", text: ["When do you stop and decide not to issue a sheet?", "Who checks the drawing after you before it goes out?", "What mistake do beginners make most often?"][qs.length] ?? "What should never be done?" });
      setDq(qs);
      setDqIdx(0);
      setDqAnswer("");
      setStage("dq");
    } catch (e) {
      console.error(e);
      toast.error("Marta could not prepare the questions. Try again.");
      setStage("capture");
    }
  };

  useEffect(() => {
    if (stage !== "dq" || !dq[dqIdx]) return;
    const text = dq[dqIdx].text;
    if (textMode.current) addLine("marta", text);
    const id = window.setTimeout(() => marta.cue(`QUESTION: "${text}"`), 1800);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, dqIdx, dq]);

  const nextDq = async () => {
    const q = dq[dqIdx];
    if (!q) return;
    const a = dqAnswerRef.current.trim();
    patchSession((cur) => ({
      debriefAnswers: [...cur.debriefAnswers, { q: q.text, a }],
      questions: [...cur.questions, { id: uid(), t: tSec(), kind: "debrief", text: q.text, eventId: q.eventId || null, pauseMs: 0, silenceMs: 0, answer: a }],
      events: cur.events.map((e) => (e.id === q.eventId && a.length >= 8 ? { ...e, explained: true } : e)),
    }));
    setDqAnswer("");
    if (dqIdx + 1 < dq.length) {
      setDqIdx(dqIdx + 1);
      return;
    }
    await runTeachBack("");
  };

  const runTeachBack = async (corr: string) => {
    if (corr) corrRef.current = `${corrRef.current} ${corr}`.trim();
    setStage("tb-load");
    const cur = getSession();
    try {
      const r = await doTeach({
        data: {
          events: cur.events.map(slim),
          transcript: cur.transcript.map((l) => ({ t: l.t, who: l.who, text: l.text })),
          answers: cur.debriefAnswers,
          correction: corr || undefined,
        },
      });
      setTeachBack(r.text);
      setCorrection("");
      setStage("tb");
      if (textMode.current) addLine("marta", r.text);
      window.setTimeout(() => marta.cue(`TEACH-BACK: ${r.text}`), 600);
    } catch (e) {
      console.error(e);
      toast.error("Teach-back failed. Try again.");
      setStage("dq");
    }
  };

  const confirmTeachBack = async () => {
    patchSession({ teachbackConfirmed: true });
    setStage("build");
    setBuildMsg("Marta is building the Work Map…");
    const cur = getSession();
    try {
      const res = await doMap({
        data: {
          expert: expertName,
          events: cur.events.map(slim),
          transcript: cur.transcript.map((l) => ({ t: l.t, who: l.who, text: l.text })),
          answers: cur.debriefAnswers,
          correction: corrRef.current || undefined,
        },
      });
      const byId = new Map(cur.events.map((e) => [e.id, e]));
      const map: WorkMap = {
        title: res.title || "Work Map",
        expert: expertName,
        apprentice: "Marta Ricci",
        summary: res.summary,
        steps: res.steps.map((st, i) => {
          const ev = (st.eventId && byId.get(st.eventId)) || cur.events[Math.min(i, cur.events.length - 1)];
          const frameUrl = ev?.frame ?? "";
          const t = Math.round(ev?.t ?? 0);
          return {
            id: `s${i + 1}`,
            t,
            frameUrl,
            action: st.action,
            decision: st.decision,
            reason_quote: st.reason_quote,
            confidence: st.confidence,
            guardrails: st.guardrails.map((g) => {
              const gev = (g.eventId && byId.get(g.eventId)) || ev;
              return {
                rule: g.rule,
                check: g.check,
                t: Math.round(gev?.t ?? t),
                frameUrl: gev?.frame ?? frameUrl,
                reason_quote: g.reason_quote || st.reason_quote,
              };
            }),
          };
        }),
      };
      setBuildMsg("Translating the Work Map into English…");
      try {
        map.en = await doTranslate({
          data: {
            title: map.title,
            summary: map.summary,
            steps: map.steps.map((x) => ({
              id: x.id,
              action: x.action,
              decision: x.decision,
              reason_quote: x.reason_quote,
              guardrails: x.guardrails.map((g) => ({ rule: g.rule, reason_quote: g.reason_quote })),
            })),
          },
        });
      } catch (e) {
        console.error("translate", e);
      }
      setBuildMsg("Saving with personal details redacted…");
      const latest = getSession();
      const saved = await doSave({
        data: {
          kind: "capture",
          title: map.title,
          person: expertName,
          events: latest.events,
          questions: latest.questions,
          transcript: latest.transcript,
          workMap: map,
          teachbackConfirmed: true,
          tests: {},
        },
      });
      patchSession({ workMap: map, savedId: saved.id, redactions: saved.redactions, phase: "done" });
      await marta.end();
      mic.stop();
      toast.success("Work Map ready");
      void navigate({ to: "/work-map" });
    } catch (e) {
      console.error(e);
      toast.error("Could not complete the Work Map. Try again.");
      setStage("tb");
    }
  };

  const mood: Mood = useMemo(() => {
    if (marta.speaking) return "speaking";
    if (drawing) return "note";
    if (openQ) return "question";
    if (busy) return "note";
    if (stage === "tb-load" || stage === "dq-load" || stage === "build") return "thinking";
    if (stage === "capture" && !offRecord) return "listening";
    return "idle";
  }, [marta.speaking, openQ, busy, stage, offRecord, drawing]);

  const elapsed = s.startedAt ? (now - s.startedAt) / 1000 : 0;
  const screenIdle = Math.max(0, now - engine.lastChangeAt.current);
  const speechIdle = Math.max(0, now - lastSpeechAt.current);
  const inCapture = stage === "capture";
  const inDebrief = stage === "dq" || stage === "dq-load" || stage === "tb" || stage === "tb-load" || stage === "build";

  return (
    <AppShell wide>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Module 01 · Capture</div>
          <h1 className="text-3xl">Watch the Master</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stage === "idle" && (
            <label className="flex items-center gap-2 text-xs">
              <span className="label">Architect</span>
              <input value={expertName} onChange={(e) => setExpertName(e.target.value)} className="border bg-card px-2 py-1.5 text-xs" />
            </label>
          )}
          {source === "screen" ? (
            <button className="btn" onClick={stopShare} data-testid="btn-stop-share">
              Back to drawings
            </button>
          ) : (
            <button className="btn" onClick={shareScreen} disabled={inDebrief} data-testid="btn-share-screen">
              Share screen
            </button>
          )}
          {inCapture && (
            <button className={`btn ${offRecord ? "btn-accent" : ""}`} onClick={toggleOff} data-testid="btn-off-record">
              {offRecord ? "Resume recording" : "Off record"}
            </button>
          )}
          {stage === "idle" && (
            <button className="btn btn-primary" onClick={begin} data-testid="btn-start">
              Start session
            </button>
          )}
          {inCapture && (
            <button className="btn btn-primary" onClick={goDebrief} disabled={s.events.length === 0} data-testid="btn-end">
              Done · go to debrief
            </button>
          )}
        </div>
      </div>

      {offRecord && (
        <div className="mb-4 border-2 border-[var(--color-accent)] bg-card px-4 py-3 text-sm" data-testid="off-record-banner">
          <b className="uppercase">Off record.</b> Marta does not watch or listen: no frames or words are read or saved.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0">
          {source === "tavole" ? (
            <div className={offRecord ? "opacity-40" : ""}>
              <TavoleViewer
                sheets={EXPERT_CASE}
                state={caseState}
                selectedId={selectedId}
                onSelect={setSelectedId}
                dispatch={dispatch}
                canvasRef={canvasRef}
                disabled={stage !== "capture"}
                onDrawing={(d) => {
                  drawingRef.current = d;
                  setDrawing(d);
                }}
              />
              {stage === "idle" && <p className="mt-2 text-xs opacity-70">Demo screen: the drawing viewer. Start a session and work as usual, or share another screen.</p>}
            </div>
          ) : (
            <div className={`frame ${offRecord ? "opacity-40" : ""}`}>
              <div className="border-b px-3 py-2 label">Shared screen · Marta checks frames every 2 seconds</div>
              <video ref={videoRef} muted playsInline className="block aspect-video w-full bg-secondary object-contain" data-testid="shared-video" />
            </div>
          )}

          {inCapture && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center" data-testid="pause-meter">
              <Meter label="Screen idle" ms={screenIdle} />
              <Meter label="Voice idle" ms={speechIdle} />
              <div className="frame px-2 py-2">
                <div className="label">Questions</div>
                <div className="text-lg font-bold">{s.questions.filter((q) => q.kind !== "debrief").length}<span className="text-xs opacity-50"> / min 3</span></div>
              </div>
            </div>
          )}

          <div className="mt-4 frame">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="label">Marta’s notebook · events</span>
              <span className="label">{s.events.length} events · {s.blurredRegions} blurred regions</span>
            </div>
            <ul className="max-h-64 divide-y overflow-auto" data-testid="events-list">
              {s.events.length === 0 && <li className="px-3 py-4 text-xs opacity-60">Marta records screen changes here.</li>}
              {s.events.map((e) => (
                <li key={e.id} className="flex gap-3 px-3 py-2">
                  {e.frame && <img src={e.frame} alt="" className="h-12 w-20 shrink-0 border object-cover" />}
                  <div className="min-w-0 text-xs">
                    <div className="font-bold">
                      <span className="opacity-50">{fmt(e.t)}</span> {e.action}
                      {e.significance === "high" && <span className="ml-2 text-[var(--color-accent)]">●</span>}
                    </div>
                    <div className="opacity-70">{e.summary}</div>
                    <div className="label mt-0.5">{e.explained ? "explained" : "to explore"}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="frame" data-testid="marta-panel">
            <div className="flex items-center gap-4 p-4">
              <MartaAvatar size={84} mood={mood} />
              <div>
                <div className="font-[family-name:var(--font-display)] text-xl font-extrabold uppercase leading-none">Marta</div>
                <div className="label mt-1">Apprentice · Politecnico di Milano</div>
                <div className="mt-2 inline-block border px-2 py-0.5 text-[0.65rem] font-bold uppercase" data-testid="marta-mood">{MOOD_LABEL[mood]}</div>
              </div>
            </div>
            <div className="border-t px-4 py-2 text-[0.7rem]">
              {stage === "idle" ? (
                "Ready. Press “Start session”."
              ) : (
                <>
                  {textOnly || marta.error ? "Text only" : marta.connected ? "Voice connected (ElevenAgents)" : marta.starting ? "Connecting…" : "Voice not connected"} ·{" "}
                  {mic.connected ? "Scribe v2 listening" : offRecord ? "Scribe paused" : "Scribe inactive"} · {fmt(elapsed)}
                </>
              )}
              {marta.error && <div className="mt-1 text-[var(--color-accent)]">{marta.error}</div>}
            </div>
          </div>

          {openQ && (
            <div className="frame border-[var(--color-accent)] p-4" data-testid="open-question">
              <div className="label text-[var(--color-accent)]">{openQ.kind === "guardrail" ? "Guardrail question" : "Marta’s question"}</div>
              <p className="mt-1 text-sm font-bold leading-snug">{openQ.text}</p>
              {openQ.answer && <p className="mt-2 border-l-2 pl-2 text-xs opacity-80">{openQ.answer}</p>}
            </div>
          )}

          {stage === "dq" && dq[dqIdx] && (
            <div className="frame p-4" data-testid="debrief-card">
              <div className="label">Debrief · question {dqIdx + 1} of {dq.length}</div>
              <p className="mt-1 text-sm font-bold leading-snug">{dq[dqIdx].text}</p>
              <textarea
                value={dqAnswer}
                onChange={(e) => setDqAnswer(e.target.value)}
                rows={3}
                placeholder="Answer aloud (Scribe) or type here…"
                className="mt-3 w-full border bg-card p-2 text-xs"
                data-testid="debrief-answer"
              />
              <button className="btn btn-primary mt-2 w-full" onClick={nextDq} disabled={dqAnswer.trim().length < 3} data-testid="btn-next-dq">
                {dqIdx + 1 < dq.length ? "Next" : "Listen to the teach-back"}
              </button>
            </div>
          )}

          {(stage === "dq-load" || stage === "tb-load") && <div className="frame p-4 text-sm">Marta is thinking…</div>}

          {stage === "tb" && (
            <div className="frame p-4" data-testid="teachback-card">
              <div className="label">Teach-back · Marta explains</div>
              <p className="mt-2 text-sm leading-relaxed">{teachBack}</p>
              <div className="mt-3 grid gap-2">
                <button className="btn btn-primary" onClick={confirmTeachBack} data-testid="btn-confirm-tb">
                  Yes, you understood
                </button>
                <textarea value={correction} onChange={(e) => setCorrection(e.target.value)} rows={2} placeholder="Or correct what she got wrong…" className="border bg-card p-2 text-xs" />
                <button className="btn" onClick={() => runTeachBack(correction)} disabled={correction.trim().length < 3}>
                  Correct and listen again
                </button>
              </div>
            </div>
          )}

          {stage === "build" && <div className="frame p-4 text-sm" data-testid="build-msg">{buildMsg}</div>}

          <div className="frame">
            <div className="border-b px-3 py-2 label">Live transcript (Scribe v2)</div>
            <ul className="max-h-60 space-y-2 overflow-auto p-3 text-xs" data-testid="transcript">
              {s.transcript.length === 0 && <li className="opacity-60">Your words and Marta’s appear here.</li>}
              {s.transcript.map((l) => (
                <li key={l.id} className={l.who === "marta" ? "border-l-2 border-[var(--color-accent)] pl-2" : ""}>
                  <span className="label mr-1">{fmt(l.t)} {l.who === "esperto" ? "architect" : l.who}</span>
                  {l.text}
                </li>
              ))}
              {mic.partial && !offRecord && <li className="opacity-50">{mic.partial}…</li>}
            </ul>
            {(stage === "capture" || stage === "dq") && (
              <div className="flex gap-2 border-t p-2">
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitTyped()}
                  placeholder="Type a reply…"
                  className="min-w-0 flex-1 border bg-card px-2 py-1.5 text-xs"
                  data-testid="typed-input"
                />
                <button className="btn" onClick={submitTyped}>
                  Send
                </button>
              </div>
            )}
          </div>

          <TestsChecklist compact />
        </aside>
      </div>
    </AppShell>
  );
}

function Meter({ label, ms }: { label: string; ms: number }) {
  const ok = ms >= 4000;
  return (
    <div className="frame px-2 py-2">
      <div className="label">{label}</div>
      <div className={`text-lg font-bold ${ok ? "text-[var(--color-accent)]" : ""}`}>{(ms / 1000).toFixed(0)}s</div>
      <div className="mt-1 h-1 bg-secondary">
        <div className="h-full bg-foreground" style={{ width: `${Math.min(100, (ms / 4000) * 100)}%` }} />
      </div>
    </div>
  );
}
