import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { MartaAvatar } from "./MartaAvatar";

const NAV = [
  { to: "/", label: "Dashboard", n: "00" },
  { to: "/watch", label: "Watch the Master", n: "01" },
  { to: "/work-map", label: "Work Map", n: "02" },
  { to: "/knowledge", label: "Knowledge Point", n: "03" },
  { to: "/tutor", label: "Voice Tutor", n: "04" },
  { to: "/history", label: "History", n: "05" },
] as const;

export function AppShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-6 px-5 py-3">
          <Link to="/" className="flex items-center gap-3">
            <MartaAvatar size={34} />
            <div className="leading-none">
              <div className="font-[family-name:var(--font-display)] text-sm font-extrabold uppercase tracking-tight">The AI Apprentice</div>
              <div className="label mt-1">Villa Horizon · Marta</div>
            </div>
          </Link>
          <nav className="ml-auto flex flex-wrap gap-1">
            {NAV.map((i) => (
              <Link
                key={i.to}
                to={i.to}
                activeOptions={{ exact: i.to === "/" }}
                className="border border-transparent px-3 py-2 text-[0.68rem] font-bold uppercase tracking-wider hover:bg-secondary data-[status=active]:border-foreground data-[status=active]:bg-foreground data-[status=active]:text-background"
              >
                <span className="mr-1.5 opacity-50">{i.n}</span>
                {i.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className={`mx-auto px-5 py-6 ${wide ? "max-w-[1500px]" : "max-w-6xl"}`}>{children}</main>
    </div>
  );
}
