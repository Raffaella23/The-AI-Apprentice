import { createFileRoute } from "@tanstack/react-router";
import { WatchSession } from "@/components/watch/WatchSession";

export const Route = createFileRoute("/watch")({
  head: () => ({
    meta: [
      { title: "Watch the Master — Marta watches and asks why" },
      { name: "description", content: "Work on screen: Marta captures a frame every two seconds, transcribes with Scribe v2 and asks questions only during pauses." },
      { property: "og:title", content: "Watch the Master — Marta watches and asks why" },
      { property: "og:description", content: "Capture the expert’s screen and voice, with questions during pauses and an off-record mode." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WatchSession,
});
