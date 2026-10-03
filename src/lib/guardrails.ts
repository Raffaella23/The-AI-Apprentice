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
      const c = g.check;
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

export const hasCustomGuardrails = (map: WorkMap) =>
  map.steps.some((s) => s.guardrails.some((g) => g.check.kind === "custom"));
