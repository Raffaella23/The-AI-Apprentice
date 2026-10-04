import type { CaseState, Guardrail, Sheet, WorkMap, WorkMapStep } from "./types";

export interface Violation {
  guardrail: Guardrail;
  step: WorkMapStep;
  why: string;
}

/** Valuta in locale le regole della Work Map prima del salvataggio ("Emetti"). */
export function findViolation(sheetId: string, sheets: Sheet[], state: CaseState, map: WorkMap): Violation | null {
  const sheet = sheets.find((s) => s.id === sheetId);
  const st = state[sheetId];
  if (!sheet || !st) return null;
  for (const step of map.steps) {
    for (const g of step.guardrails) {
      const c = { ...g.check, kind: effectiveKind(g) };
      if (c.kind === "rev_mismatch") {
        const other = sheets.find((o) => o.id !== sheet.id && o.group === sheet.group && state[o.id]?.rev !== st.rev);
        if (other) {
          return {
            guardrail: g,
            step,
            why: `${sheet.title} è in rev ${st.rev}, ma ${other.title} (stesso gruppo) è in rev ${state[other.id]?.rev}.`,
          };
        }
      } else if (c.kind === "second_approval") {
        if (sheet.tag === c.tag && st.approval !== "second") {
          return { guardrail: g, step, why: `${sheet.title} non ha la seconda approvazione.` };
        }
      } else if (c.kind === "phase_forbidden") {
        if (sheet.tag === c.tag && st.phase === c.phase) {
          return { guardrail: g, step, why: `${sheet.title} è in fase ${st.phase}.` };
        }
      } else if (c.kind === "no_issue_if_held") {
        if (st.approval === "held") {
          return { guardrail: g, step, why: `${sheet.title} è sospeso.` };
        }
      }
    }
  }
  return null;
}

const HOLD_RE = /on hold|hold|sospes/i;
const REV_RE = /revision|revisione/i;

/** Custom guardrails whose text talks about hold/revisions are treated as the built-in kinds. */
export function effectiveKind(g: Guardrail): Guardrail["check"]["kind"] {
  if (g.check.kind !== "custom") return g.check.kind;
  const txt = `${g.rule} ${g.reason_quote}`;
  if (HOLD_RE.test(txt)) return "no_issue_if_held";
  if (REV_RE.test(txt)) return "rev_mismatch";
  return "custom";
}

/** Always-on safety net, independent of the Work Map: held sheets and revision mismatches never get issued. */
export function safetyNetViolation(sheetId: string, sheets: Sheet[], state: CaseState, map: WorkMap): Violation | null {
  const sheet = sheets.find((s) => s.id === sheetId);
  const st = state[sheetId];
  if (!sheet || !st) return null;
  const find = (kind: "no_issue_if_held" | "rev_mismatch", re: RegExp) => {
    for (const step of map.steps)
      for (const g of step.guardrails)
        if (effectiveKind(g) === kind || re.test(g.rule)) return { step, g };
    return null;
  };
  const synth = (rule: string, quote: string, kind: "no_issue_if_held" | "rev_mismatch") => {
    const g: Guardrail = { rule, reason_quote: quote, check: { kind }, t: 0, frameUrl: "" };
    const step: WorkMapStep = { id: `safety-${kind}`, t: 0, frameUrl: "", action: "Issue sheet", decision: rule, reason_quote: quote, guardrails: [g], confidence: 1 };
    return { step, g };
  };
  if (st.approval === "held") {
    const hit = find("no_issue_if_held", HOLD_RE) ?? synth("Never issue a sheet that is on hold", "On hold means I have a doubt. A doubt never goes to the client.", "no_issue_if_held");
    return { guardrail: hit.g, step: hit.step, why: `${sheet.title} is on hold.` };
  }
  const other = sheets.find((o) => o.id !== sheet.id && o.group === sheet.group && state[o.id] && state[o.id]!.rev !== st.rev);
  if (other) {
    const hit = find("rev_mismatch", REV_RE) ?? synth("Never issue a sheet whose revision differs from its linked sheets", "Two revisions on site means two different buildings.", "rev_mismatch");
    return { guardrail: hit.g, step: hit.step, why: `${sheet.title} is rev ${st.rev}, but ${other.title} (same group) is rev ${state[other.id]?.rev}.` };
  }
  return null;
}

export const hasCustomGuardrails = (map: WorkMap) =>
  map.steps.some((s) => s.guardrails.some((g) => g.check.kind === "custom"));
