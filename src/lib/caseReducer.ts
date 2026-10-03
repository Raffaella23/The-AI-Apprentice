import type { CaseState, Sheet, UiAction } from "./types";

export function applyAction(state: CaseState, a: UiAction): CaseState {
  const cur = state[a.sheetId];
  if (!cur) return state;
  switch (a.type) {
    case "rev":
      return { ...state, [a.sheetId]: { ...cur, rev: a.value as typeof cur.rev, issued: false } };
    case "phase":
      return { ...state, [a.sheetId]: { ...cur, phase: a.value as typeof cur.phase, issued: false } };
    case "approval":
      return { ...state, [a.sheetId]: { ...cur, approval: a.value as typeof cur.approval, issued: false } };
    case "annotate": {
      const [x = 0.5, y = 0.5] = (a.value ?? "0.5,0.5").split(",").map(Number);
      return {
        ...state,
        [a.sheetId]: { ...cur, notes: [...cur.notes, { id: Math.random().toString(36).slice(2, 7), x, y, text: "Note" }] },
      };
    }
    case "issue":
      return { ...state, [a.sheetId]: { ...cur, issued: true } };
    case "sketch": {
      let pts: [number, number][] = [];
      try {
        pts = JSON.parse(a.value ?? "[]");
      } catch {
        pts = [];
      }
      if (pts.length < 2) return state;
      return { ...state, [a.sheetId]: { ...cur, sketches: [...(cur.sketches ?? []), { id: Math.random().toString(36).slice(2, 7), pts }] } };
    }
    default:
      return state;
  }
}

const APPROVAL_LABEL: Record<string, string> = {
  none: "none",
  approved: "approved",
  held: "on hold",
  second: "second approval",
};

/** Descrizione testuale deterministica di un'azione (fatto certo per la visione). */
export function describeAction(a: UiAction, sheets: Sheet[]): string {
  const s = sheets.find((x) => x.id === a.sheetId)?.title ?? a.sheetId;
  switch (a.type) {
    case "select":
      return `Opens ${s}`;
    case "rev":
      return `${s}: revisione da ${a.before} a ${a.value}`;
    case "phase":
      return `${s}: fase da ${a.before} a ${a.value}`;
    case "approval":
      return `${s}: approvazione ${APPROVAL_LABEL[a.before ?? "none"]} → ${APPROVAL_LABEL[a.value ?? "none"]}`;
    case "annotate":
      return `${s}: aggiunge un'annotazione`;
    case "issue":
      return `${s}: EMETTE la tavola`;
    case "sketch":
      return `${s}: l'esperto SCHIZZA a mano sulla tavola — ${a.label ?? "segno a mano libera"}`;
  }
}
