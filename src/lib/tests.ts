import type { AppSession } from "./store";
import type { TestResult } from "./types";

/** I 5 Apprentice Test calcolati sui dati reali della sessione. */
export function computeTests(s: AppSession): TestResult[] {
  const qs = s.questions.filter((q) => q.kind !== "debrief");
  const natural = qs.filter((q) => q.pauseMs >= 4000 && q.silenceMs >= 4000);
  const guard = qs.filter((q) => q.kind === "guardrail");
  const whys = qs.filter((q) => q.kind === "why");
  const started = s.startedAt !== null || s.events.length > 0;

  const t1: TestResult = {
    id: 1,
    name: "When to ask",
    pass: !started ? null : qs.length === 0 ? null : natural.length === qs.length && qs.length >= 3,
    detail: qs.length ? `${natural.length}/${qs.length} questions after ≥ 4 s of quiet (screen and voice)` : "Marta only speaks during pauses: no questions yet",
  };
  const t2: TestResult = {
    id: 2,
    name: "What to ask",
    pass: qs.length === 0 ? null : guard.length >= 1 && whys.length >= 2 && qs.length >= 3,
    detail: `${whys.length} why questions + ${guard.length} about limits · needs ≥ 3 questions, one about a guardrail`,
  };
  const t3: TestResult = {
    id: 3,
    name: "When understood",
    pass: s.teachbackConfirmed ? true : s.phase === "debrief" ? false : null,
    detail: s.teachbackConfirmed ? "Expert confirmed the teach-back before closing the Work Map" : "Waiting for the expert to confirm the teach-back",
  };
  const t4: TestResult = {
    id: 4,
    name: "Whether they learned",
    pass: s.tutorScore ? s.tutorScore.score >= 60 : null,
    detail: s.tutorScore ? `New hire: ${s.tutorScore.score}/100 · ${s.tutorAttempts.filter((a) => a.blocked).length} blocks before saving` : "Measured in Voice Tutor on a new case",
  };
  const t5: TestResult = {
    id: 5,
    name: "Trust · off record · privacy",
    pass: s.savedId ? true : null,
    detail: `Off record: ${s.offRecordCount} pauses (transcription stopped), ${s.droppedFrames} frames dropped · ${s.blurredRegions} regions blurred · ${s.redactions} personal details redacted from saved text`,
  };
  return [t1, t2, t3, t4, t5];
}
