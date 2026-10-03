import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app/AppShell";
import { WorkMapView } from "@/components/app/WorkMapView";
import { listSessions } from "@/lib/sessions.functions";
import type { Lang, SessionRow } from "@/lib/types";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History — Marta’s sessions" },
      { name: "description", content: "Saved capture and tutoring sessions, with Work Maps and scores." },
      { property: "og:title", content: "History — Marta’s sessions" },
      { property: "og:description", content: "Saved sessions with personal details redacted." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const list = useServerFn(listSessions);
  const { data, isLoading, error } = useQuery({ queryKey: ["sessions"], queryFn: () => list() });
  const [open, setOpen] = useState<SessionRow | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  return (
    <AppShell wide>
      <div className="mb-5">
        <div className="label">Archive</div>
        <h1 className="text-3xl">History</h1>
      </div>
      {isLoading && <div className="frame p-6 text-sm">Loading sessions…</div>}
      {error && <div className="frame p-6 text-sm">Could not load session history.</div>}
      {data && data.length === 0 && <div className="frame p-6 text-sm opacity-70">No saved sessions yet. Record your first in Watch the Master.</div>}
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <ul className="frame divide-y" data-testid="history-list">
          {(data ?? []).map((r) => (
            <li key={r.id}>
              <button onClick={() => setOpen(r)} className={`w-full p-3 text-left text-xs ${open?.id === r.id ? "bg-foreground text-background" : "hover:bg-secondary"}`}>
                <div className="label !opacity-70">{r.kind === "capture" ? "Capture" : "Tutor"} · {new Date(r.created_at).toLocaleString("en-GB")}</div>
                <div className="mt-0.5 font-bold">{r.title || "Session"}</div>
                <div className="opacity-70">{r.person} · {r.events?.length ?? 0} events · {r.redactions} details redacted{r.score?.score != null ? ` · ${r.score.score}/100` : ""}</div>
              </button>
            </li>
          ))}
        </ul>
        <div>
          {open?.work_map ? (
            <WorkMapView map={open.work_map} lang={lang} onLang={setLang} tutorCta={false} />
          ) : open ? (
            <div className="frame space-y-3 p-5 text-sm" data-testid="history-tutor">
              <div className="label">Tutoring session</div>
              <h2 className="text-xl">{open.title}</h2>
              <p>{open.score?.verdict}</p>
              {open.score?.report && (
                <div className="text-xs">
                  <b>Next exercise:</b> {open.score.report.nextExercise}
                </div>
              )}
            </div>
          ) : (
            <div className="frame p-6 text-sm opacity-70">Choose a session.</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
