import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { Lang, WorkMap } from "@/lib/types";
import { downloadText, workMapToAgentText } from "@/lib/export";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function WorkMapView({ map, lang, onLang, tutorCta = true }: { map: WorkMap; lang: Lang; onLang?: (l: Lang) => void; tutorCta?: boolean }) {
  const [sel, setSel] = useState(0);
  const en = lang === "en" ? map.en : undefined;
  const st = map.steps[Math.min(sel, map.steps.length - 1)];
  const e = en?.steps[Math.min(sel, map.steps.length - 1)];
  const L = (it: string, e: string) => (lang === "en" ? e : it);

  const exportAgents = () => {
    const parts = [workMapToAgentText(map, "it")];
    if (map.en) parts.push("\n\n---\n\n" + workMapToAgentText(map, "en"));
    downloadText(`work-map-${map.expert.replace(/\W+/g, "-").toLowerCase()}.txt`, parts.join(""));
  };

  return (
    <div data-testid="work-map">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <div className="label">
            {map.demo ? "Sample map" : "Work Map"} · {map.expert} → {map.apprentice}
          </div>
          <h2 className="text-2xl">{en?.title ?? map.title}</h2>
          <p className="mt-2 text-sm leading-relaxed opacity-80">{en?.summary ?? map.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onLang && (
            <div className="flex border">
              {(["en", "it"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => onLang(l)}
                  disabled={l === "en" && !map.en}
                  className={`px-3 py-2 text-[0.7rem] font-bold uppercase ${lang === l ? "bg-foreground text-background" : "hover:bg-secondary"} disabled:opacity-30`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          <button className="btn" onClick={exportAgents} data-testid="btn-export-agents">
            Export for agents
          </button>
          {tutorCta && (
            <Link to="/tutor" className="btn btn-primary">
              Teach with Voice Tutor
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <ol className="frame relative" data-testid="timeline">
          {map.steps.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => setSel(i)}
                data-testid={`step-${i}`}
                className={`flex w-full gap-3 border-b p-3 text-left ${i === sel ? "bg-foreground text-background" : "hover:bg-secondary"}`}
              >
                <span className="font-[family-name:var(--font-display)] text-lg font-extrabold leading-none">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 text-xs">
                  <span className="label block !opacity-60">{fmt(s.t)} · {Math.round(s.confidence * 100)}%</span>
                  <span className="mt-0.5 block font-bold leading-snug">{en?.steps[i]?.action ?? s.action}</span>
                  {s.guardrails.length > 0 && <span className="label mt-1 block !opacity-80">{s.guardrails.length} guardrail</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>

        {st && (
          <article className="space-y-4" data-testid="step-detail">
            <div className="frame">
              <div className="grid gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                <div className="border-b bg-secondary md:border-b-0 md:border-r">
                  {st.frameUrl ? <img src={st.frameUrl} alt={L("Momento sullo schermo", "Screen moment")} className="aspect-[8/5] w-full object-contain" /> : <div className="aspect-[8/5]" />}
                  <div className="label border-t px-3 py-1.5">{L("Momento sullo schermo", "Screen moment")} · t={fmt(st.t)}</div>
                </div>
                <div className="space-y-4 p-4">
                  <div>
                    <div className="label">{L("Azione", "Action")}</div>
                    <p className="text-sm font-bold">{e?.action ?? st.action}</p>
                  </div>
                  <div>
                    <div className="label">{L("Decisione", "Decision")}</div>
                    <p className="text-sm">{e?.decision ?? st.decision}</p>
                  </div>
                  <div>
                    <div className="label">{L("Perché · parole dell'esperto", "Why · in the expert's words")}</div>
                    <blockquote className="mt-1 border-l-4 border-[var(--color-accent)] pl-3 text-sm italic leading-relaxed">
                      «{(e?.reason_quote ?? st.reason_quote) || L("Non spiegato", "Not explained")}»
                    </blockquote>
                  </div>
                </div>
              </div>
            </div>

            {st.guardrails.length > 0 && (
              <div>
                <div className="label mb-2">Guardrail</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {st.guardrails.map((g, j) => (
                    <div key={j} className="frame" data-testid="guardrail-card">
                      {g.frameUrl && <img src={g.frameUrl} alt="" className="aspect-[8/3] w-full border-b object-cover object-top" />}
                      <div className="space-y-2 p-3 text-xs">
                        <div className="label !opacity-100 text-[var(--color-accent)]">
                          {L("Guardrail", "Guardrail")} · t={fmt(g.t)}
                        </div>
                        <p className="text-sm font-bold leading-snug">{e?.guardrails[j]?.rule ?? g.rule}</p>
                        <blockquote className="border-l-2 pl-2 italic opacity-80">«{e?.guardrails[j]?.reason_quote ?? g.reason_quote}»</blockquote>
                        <div className="label">{L("Controllo", "Check")}: {g.check.kind}{g.check.tag ? ` · ${g.check.tag}` : ""}{g.check.phase ? ` · ${g.check.phase}` : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
