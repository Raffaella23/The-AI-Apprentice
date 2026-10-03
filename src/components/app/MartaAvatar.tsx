import marta from "@/assets/marta.jpg";
import type { Mood } from "@/lib/persona";

export function MartaAvatar({ size = 64, mood = "idle", square }: { size?: number; mood?: Mood; square?: boolean }) {
  const speaking = mood === "speaking" || mood === "question";
  const ring = mood === "alert" ? "outline outline-2 outline-[var(--color-accent)]" : "";
  return (
    <img
      src={marta}
      alt="Marta Ricci, apprendista architetta"
      width={size}
      height={size}
      className={`${square ? "" : "rounded-full"} object-cover object-top ${speaking ? "marta-speaking" : "marta-idle"} ${ring}`}
      style={{ width: size, height: size }}
    />
  );
}
