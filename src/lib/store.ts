import { useSyncExternalStore } from "react";
import type { CaptureEvent, MasteryReport, Prediction, QuestionLog, TranscriptLine, TutorAttempt, WorkMap } from "./types";

export interface AppSession {
  startedAt: number | null;
  events: CaptureEvent[];
  questions: QuestionLog[];
  transcript: TranscriptLine[];
  workMap: WorkMap | null;
  teachbackConfirmed: boolean;
  debriefAnswers: { q: string; a: string }[];
  offRecordCount: number;
  droppedFrames: number;
  droppedSpeech: number;
  redactions: number;
  blurredRegions: number;
  phase: "idle" | "capture" | "debrief" | "done";
  savedId: string | null;
  tutorAttempts: TutorAttempt[];
  tutorScore: { score: number; verdict: string } | null;
  tutorSavedId: string | null;
  tutorPredictions: Prediction[];
  tutorReport: MasteryReport | null;
}

export const emptySession = (): AppSession => ({
  startedAt: null,
  events: [],
  questions: [],
  transcript: [],
  workMap: null,
  teachbackConfirmed: false,
  debriefAnswers: [],
  offRecordCount: 0,
  droppedFrames: 0,
  droppedSpeech: 0,
  redactions: 0,
  blurredRegions: 0,
  phase: "idle",
  savedId: null,
  tutorAttempts: [],
  tutorScore: null,
  tutorSavedId: null,
  tutorPredictions: [],
  tutorReport: null,
});

const KEY = "apprentice-session-v1";
const EMPTY = emptySession();
let state: AppSession | null = null;
const listeners = new Set<() => void>();

function load(): AppSession {
  if (state) return state;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    state = raw ? { ...emptySession(), ...JSON.parse(raw) } : emptySession();
  } catch {
    state = emptySession();
  }
  return state!;
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // quota: le miniature più vecchie vengono scartate
    if (state) {
      state = { ...state, events: state.events.map((e, i) => (i < state!.events.length - 6 ? { ...e, frame: "" } : e)) };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        /* ignore */
      }
    }
  }
}

export function getSession() {
  return load();
}

export function patchSession(p: Partial<AppSession> | ((s: AppSession) => Partial<AppSession>)) {
  const cur = load();
  const next = typeof p === "function" ? p(cur) : p;
  state = { ...cur, ...next };
  persist();
  listeners.forEach((l) => l());
}

export function resetSession() {
  state = emptySession();
  persist();
  listeners.forEach((l) => l());
}

export function useAppSession(): AppSession {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => load(),
    () => EMPTY,
  );
}

export const uid = () => Math.random().toString(36).slice(2, 10);
