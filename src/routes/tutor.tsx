import { createFileRoute } from "@tanstack/react-router";
import { TutorSession } from "@/components/tutor/TutorSession";

export const Route = createFileRoute("/tutor")({
  head: () => ({
    meta: [
      { title: "Voice Tutor — Marta teaches expert judgement" },
      { name: "description", content: "A new hire works on a different case: Marta asks for predictions, stops mistakes before saving and recalls the expert's reasoning." },
      { property: "og:title", content: "Voice Tutor — Marta teaches expert judgement" },
      { property: "og:description", content: "Voice tutoring with a per-step and per-guardrail mastery report." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TutorSession,
});
