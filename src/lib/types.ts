export type Phase = "Permesso" | "Esecutivo" | "Cliente";
export type Approval = "none" | "approved" | "held" | "second";
export type Rev = "A" | "B" | "C";
export type SheetTag = "pianta" | "prospetto" | "sezione" | "interrato" | "giardino";

export interface Sheet {
  id: string;
  code: string;
  title: string;
  tag: SheetTag;
  group: string; // fogli collegati (stessa pianta di riferimento)
  image: string;
}

export interface SheetState {
  rev: Rev;
  phase: Phase;
  approval: Approval;
  issued: boolean;
  notes: { id: string; x: number; y: number; text: string }[];
  /** Schizzi a mano libera dell'esperto: punti normalizzati 0..1 sull'area della tavola. */
  sketches?: { id: string; pts: [number, number][] }[];
}

export type CaseState = Record<string, SheetState>;

export interface UiAction {
  type: "select" | "rev" | "phase" | "approval" | "annotate" | "issue" | "sketch";
  sheetId: string;
  value?: string;
  before?: string;
  /** Descrizione leggibile (es. schizzo: "cerchia una zona in alto a sinistra"). */
  label?: string;
}

export interface CaptureEvent {
  id: string;
  t: number; // secondi dall'inizio sessione
  action: string; // es. "Prospetto Sud portato a rev B"
  summary: string;
  sheetId: string | null;
  significance: "low" | "high";
  frame: string; // data URL (miniatura)
  explained: boolean;
  /** true se l'evento nasce da uno schizzo dell'esperto sulla tavola */
  sketch?: boolean;
}

export interface QuestionLog {
  id: string;
  t: number;
  kind: "why" | "guardrail" | "debrief";
  text: string;
  eventId: string | null;
  pauseMs: number; // ms senza cambi schermo al momento della domanda
  silenceMs: number; // ms senza voce dell'esperto
  answer?: string;
}

export interface TranscriptLine {
  id: string;
  t: number;
  who: "esperto" | "marta" | "nuovo";
  text: string;
}

export type GuardrailKind =
  | "rev_mismatch" // non emettere se la rev non coincide con quella dei fogli collegati
  | "second_approval" // i fogli con tag X vanno in seconda approvazione prima dell'emissione
  | "phase_forbidden" // i fogli con tag X non possono stare in fase Y
  | "no_issue_if_held" // non emettere un foglio sospeso
  | "custom";

export interface Guardrail {
  rule: string; // frase in parole dell'esperto
  check: { kind: GuardrailKind; tag?: SheetTag | undefined; phase?: Phase | undefined };
  t: number; // momento della sessione in cui l'esperto l'ha espresso
  frameUrl: string; // fotogramma del momento (già sfocato dalle PII)
  reason_quote: string; // citazione dell'esperto sul limite
}

export interface WorkMapStep {
  id: string;
  t: number;
  frameUrl: string;
  action: string;
  decision: string;
  reason_quote: string;
  guardrails: Guardrail[];
  confidence: number; // 0..1
}

export type Lang = "it" | "en";

export interface WorkMapEn {
  title: string;
  summary: string;
  steps: { id: string; action: string; decision: string; reason_quote: string; guardrails: { rule: string; reason_quote: string }[] }[];
}

export interface WorkMap {
  title: string;
  expert: string;
  apprentice: string;
  summary: string;
  steps: WorkMapStep[];
  en?: WorkMapEn; // versione inglese, salvata insieme all'italiano
  demo?: boolean;
}

export interface TestResult {
  id: 1 | 2 | 3 | 4 | 5;
  name: string;
  pass: boolean | null;
  detail: string;
}

export interface TutorAttempt {
  t: number;
  sheetId: string;
  blocked: boolean;
  guardrail?: string;
  stepId?: string;
}

export interface Prediction {
  stepId: string;
  question: string;
  answer: string;
  score: number; // 0-100
  feedback: string;
}

export interface MasteryReport {
  steps: { stepId: string; label: string; status: "mastered" | "practice"; note: string }[];
  guardrails: { rule: string; stepId: string; status: "mastered" | "practice"; note: string }[];
  nextExercise: string;
}

export interface SessionRow {
  id: string;
  kind: string;
  title: string;
  person: string;
  created_at: string;
  work_map: WorkMap | null;
  events: CaptureEvent[];
  questions: QuestionLog[];
  transcript: TranscriptLine[];
  teachback_confirmed: boolean;
  redactions: number;
  score: { score?: number; verdict?: string; attempts?: TutorAttempt[]; predictions?: Prediction[]; report?: MasteryReport } | null;
  tests: Record<string, never> | Record<string, string | number | boolean>;
}
