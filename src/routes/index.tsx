import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { MartaAvatar } from "@/components/app/MartaAvatar";
import { TestsChecklist } from "@/components/app/TestsChecklist";
import marta from "@/assets/marta.jpg";
import { MARTA } from "@/lib/persona";
import { useAppSession } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The AI Apprentice — learn from expert practice" },
      { name: "description", content: "Marta, an architecture apprentice, observes expert work, asks why, builds a Work Map and tutors a new hire." },
      { property: "og:title", content: "The AI Apprentice — learn from expert practice" },
      { property: "og:description", content: "Capture expert judgement in action, map it and teach it to the next generation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const s = useAppSession();
  const mods = [
    { n: "01", to: "/watch", title: "Watch the Master", text: "The architect works on drawings or a shared screen. Marta watches and asks why only during natural pauses.", stat: `${s.events.length} events · ${s.questions.filter((q) => q.kind !== "debrief").length} questions` },
    { n: "02", to: "/work-map", title: "Work Map", text: "Debrief, expert-confirmed teach-back, then a timeline of moments, decisions, reasoning and guardrails.", stat: s.workMap ? `${s.workMap.steps.length} steps` : "Sample map available" },
    { n: "03", to: "/tutor", title: "Voice Tutor", text: "A new hire takes on a different case. Marta asks for predictions, stops mistakes before saving and replays the expert’s moment.", stat: s.tutorScore ? `Last score ${s.tutorScore.score}/100` : "Not tried yet" },
  ] as const;
  return (
    <AppShell>
      <section className="grid items-stretch gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="flex flex-col justify-between py-2">
          <div>
            <div className="label">Challenge 01 · The AI Apprentice</div>
            <h1 className="mt-3 text-5xl leading-[0.95] md:text-6xl">Learn the craft, not the manual.</h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed opacity-80">
              When an expert retires, their judgement goes with them: when to stop, what never to do, and why. Marta watches, asks, learns and passes it on.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/watch" className="btn btn-primary">Start Watch the Master</Link>
            <Link to="/tutor" className="btn">Try Voice Tutor</Link>
          </div>
        </div>
        <div className="frame overflow-hidden">
          <img src={marta} alt="Marta Ricci, architecture apprentice" className="aspect-[4/5] w-full object-cover object-top" />
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {mods.map((m) => (
          <Link key={m.n} to={m.to} className="frame group flex flex-col justify-between p-5 transition-colors hover:bg-foreground hover:text-background">
            <div>
              <div className="font-[family-name:var(--font-display)] text-4xl font-extrabold opacity-30">{m.n}</div>
              <h2 className="mt-2 text-xl">{m.title}</h2>
              <p className="mt-2 text-xs leading-relaxed opacity-80">{m.text}</p>
            </div>
            <div className="label mt-4">{m.stat}</div>
          </Link>
        ))}
      </section>

      <section className="mt-10 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="frame p-5">
          <div className="flex items-center gap-4">
            <MartaAvatar size={72} />
            <div>
              <div className="label">Meet Marta</div>
              <h2 className="text-xl">{MARTA.name}, {MARTA.age}</h2>
              <div className="label mt-1">{MARTA.origin}</div>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed opacity-80">{MARTA.study}. {MARTA.thesis}.</p>
          {MARTA.bio.map((b) => (
            <p key={b} className="mt-3 text-xs leading-relaxed">{b}</p>
          ))}
          <div className="label mt-4">What worries her</div>
          <p className="text-xs">{MARTA.fear}</p>
          <ul className="mt-3 list-disc pl-5 text-xs leading-relaxed opacity-80">
            {MARTA.quirks.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
        <TestsChecklist />
      </section>
    </AppShell>
  );
}
