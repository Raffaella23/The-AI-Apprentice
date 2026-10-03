import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/AppShell";
import { listSessions } from "@/lib/sessions.functions";
import { DEMO_MAP } from "@/lib/persona";
import { useAppSession } from "@/lib/store";
import type { WorkMap } from "@/lib/types";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Point — expert rules, one by one" },
      { name: "description", content: "The knowledge Marta collected, rule by rule: what to avoid, why, and when the expert said it." },
      { property: "og:title", content: "Knowledge Point — expert rules, one by one" },
      { property: "og:description", content: "Every guardrail with its frame, timestamp and quote, searchable by topic." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgePage,
});

const KINDS: Record<string, string> = {
  rev_mismatch: "Revisions",
  second_approval: "Approvals",
  phase_forbidden: "Phases",
  no_issue_if_held: "Issuing",
  custom: "Other",
};

function KnowledgePage() {
  const s = useAppSession();
  const list = useServerFn(listSessions);
  const { data } = useQuery({ queryKey: ["sessions"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");

  const points = useMemo(() => {
    const maps: { map: WorkMap; source: string }[] = [];
    if (s.workMap) maps.push({ map: s.workMap, source: "Current session" });
    for (const r of data ?? []) if (r.work_map && r.kind === "capture") maps.push({ map: r.work_map, source: new Date(r.created_at).toLocaleDateString("en-GB") });
    if (!maps.length) maps.push({ map: DEMO_MAP, source: "Sample map" });
    return maps.flatMap(({ map, source }) =>
      map.steps.flatMap((st) =>
        st.guardrails.map((g) => ({ key: `${source}-${st.id}-${g.rule}`, source, expert: map.expert, step: st.action, ...g })),
      ),
    );
  }, [s.workMap, data]);

  const shown = points.filter((p) => (kind === "all" || p.check.kind === kind) && (!q || `${p.rule} ${p.reason_quote} ${p.step}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <AppShell wide>
      <div className="mb-5">
        <div className="label">Collected knowledge</div>
        <h1 className="text-3xl">Knowledge Point</h1>
        <p className="mt-2 max-w-2xl text-sm opacity-80">Every rule the expert shared, with the moment they shared it and their reasoning.</p>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rules or keywords…" className="min-w-64 border bg-card px-3 py-2 text-xs" />
        {["all", ...Object.keys(KINDS)].map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`border px-3 py-2 text-[0.65rem] font-bold uppercase ${kind === k ? "bg-foreground text-background" : "hover:bg-secondary"}`}>
            {k === "all" ? "All" : KINDS[k]}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="knowledge-grid">
        {shown.length === 0 && <div className="frame p-6 text-sm opacity-70">No matching Knowledge Points.</div>}
        {shown.map((p) => (
          <article key={p.key} className="frame">
            {p.frameUrl && <img src={p.frameUrl} alt="" className="aspect-[8/3] w-full border-b object-cover object-top" />}
            <div className="space-y-2 p-4 text-xs">
              <div className="flex justify-between">
                <span className="label !opacity-100 text-[var(--color-accent)]">{KINDS[p.check.kind]}</span>
                <span className="label">t={Math.floor(p.t / 60)}:{String(Math.floor(p.t % 60)).padStart(2, "0")}</span>
              </div>
              <h3 className="text-base normal-case leading-snug">{p.rule}</h3>
              <blockquote className="border-l-2 border-[var(--color-accent)] pl-2 italic opacity-80">«{p.reason_quote}»</blockquote>
              <div className="label">{p.expert} · {p.source}</div>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
