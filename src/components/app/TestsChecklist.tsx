import { useAppSession } from "@/lib/store";
import { computeTests } from "@/lib/tests";

export function TestsChecklist({ compact }: { compact?: boolean }) {
  const s = useAppSession();
  const tests = computeTests(s);
  return (
    <div className="frame" data-testid="tests-checklist">
      <div className="border-b px-3 py-2">
        <span className="label">5 Apprentice Tests · live</span>
      </div>
      <ul className="divide-y">
        {tests.map((t) => (
          <li key={t.id} className="flex gap-3 px-3 py-2">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[0.65rem] font-bold ${
                t.pass === true ? "bg-foreground text-background" : t.pass === false ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "opacity-50"
              }`}
            >
              {t.pass === true ? "✓" : t.pass === false ? "!" : t.id}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wide">{t.name}</div>
              {!compact && <div className="mt-0.5 text-[0.7rem] leading-snug opacity-70">{t.detail}</div>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
