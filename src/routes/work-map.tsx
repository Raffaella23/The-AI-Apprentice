import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { WorkMapView } from "@/components/app/WorkMapView";
import { DEMO_MAP } from "@/lib/persona";
import { useAppSession } from "@/lib/store";
import type { Lang } from "@/lib/types";

export const Route = createFileRoute("/work-map")({
  head: () => ({
    meta: [
      { title: "Work Map — a timeline of expert judgement" },
      { name: "description", content: "Each step pairs a screen moment, decision, expert reasoning and guardrails. Exportable for agents." },
      { property: "og:title", content: "Work Map — a timeline of expert judgement" },
      { property: "og:description", content: "Steps and guardrails with frames, timestamps and expert quotes, in English and Italian." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkMapPage,
});

function WorkMapPage() {
  const s = useAppSession();
  const [lang, setLang] = useState<Lang>("en");
  const map = s.workMap ?? DEMO_MAP;
  return (
    <AppShell wide>
      <div className="mb-5">
        <div className="label">Module 02 · Map</div>
        <h1 className="text-3xl">Work Map</h1>
      </div>
      {!s.workMap && (
        <div className="mb-5 frame flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <span>No recorded session yet: this is a sample Work Map.</span>
          <Link to="/watch" className="btn btn-primary">Record yours</Link>
        </div>
      )}
      <WorkMapView map={map} lang={lang} onLang={setLang} />
    </AppShell>
  );
}
