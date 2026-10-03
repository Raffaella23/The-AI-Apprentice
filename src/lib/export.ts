import type { Lang, WorkMap } from "./types";

const mm = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

const CHECK: Record<string, { it: string; en: string }> = {
  rev_mismatch: { it: "blocca se la revisione del foglio è diversa da quella dei fogli collegati", en: "block if the sheet revision differs from its linked sheets" },
  second_approval: { it: "blocca se manca la seconda approvazione", en: "block if the second approval is missing" },
  phase_forbidden: { it: "blocca se il foglio è in una fase vietata", en: "block if the sheet is in a forbidden phase" },
  no_issue_if_held: { it: "blocca se il foglio è sospeso", en: "block if the sheet is on hold" },
  custom: { it: "giudizio dell'agente sulla regola", en: "agent judgement on the rule" },
};

/** Istruzioni testuali caricabili da un agente (prompt/knowledge), in una lingua. */
export function workMapToAgentText(map: WorkMap, lang: Lang): string {
  const en = lang === "en" && map.en ? map.en : null;
  const L = (it: string, e: string) => (lang === "en" ? e : it);
  const out: string[] = [];
  out.push(`# ${en?.title ?? map.title}`);
  out.push(L(`Esperto: ${map.expert} · Raccolto da: ${map.apprentice}`, `Expert: ${map.expert} · Captured by: ${map.apprentice}`));
  out.push("");
  out.push(en?.summary ?? map.summary);
  out.push("");
  out.push(
    L(
      "## Istruzioni per l'agente\nSegui i passaggi nell'ordine. Prima di ogni azione verifica i guardrail del passaggio. Se un guardrail è violato NON procedere: fermati, spiega il motivo con le parole dell'esperto e chiedi come procedere. Non inventare regole che non sono qui.",
      "## Agent instructions\nFollow the steps in order. Before each action check that step's guardrails. If a guardrail is violated DO NOT proceed: stop, explain why using the expert's own words, and ask how to proceed. Do not invent rules that are not listed here.",
    ),
  );
  map.steps.forEach((st, i) => {
    const e = en?.steps[i];
    out.push("");
    out.push(`### ${L("Passaggio", "Step")} ${i + 1} · t=${mm(st.t)}`);
    out.push(`${L("Azione", "Action")}: ${e?.action ?? st.action}`);
    out.push(`${L("Decisione", "Decision")}: ${e?.decision ?? st.decision}`);
    out.push(`${L("Perché (parole dell'esperto)", "Why (expert's words)")}: «${e?.reason_quote ?? st.reason_quote}»`);
    if (st.guardrails.length) out.push(`${L("Guardrail", "Guardrails")}:`);
    st.guardrails.forEach((g, j) => {
      const ge = e?.guardrails[j];
      out.push(`- ${L("REGOLA", "RULE")}: ${ge?.rule ?? g.rule}`);
      out.push(`  ${L("Controllo", "Check")}: ${CHECK[g.check.kind]?.[lang] ?? g.check.kind}${g.check.tag ? ` [${g.check.tag}]` : ""}${g.check.phase ? ` [${g.check.phase}]` : ""}`);
      out.push(`  ${L("Momento", "Moment")}: t=${mm(g.t)} · ${L("Citazione", "Quote")}: «${ge?.reason_quote ?? g.reason_quote}»`);
    });
  });
  return out.join("\n") + "\n";
}

export function downloadText(name: string, text: string, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
