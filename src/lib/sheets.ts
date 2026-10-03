import type { CaseState, Sheet } from "./types";

export const EXPERT_CASE: Sheet[] = [
  { id: "a-terra", code: "TAV. 01", title: "Ground floor plan", tag: "pianta", group: "terra", image: "/demo/piano_terra2.png" },
  { id: "a-sud", code: "TAV. 02", title: "South elevation", tag: "prospetto", group: "terra", image: "/demo/PlaceholderProspettosud.png" },
  { id: "a-sez1", code: "TAV. 03", title: "Section 1", tag: "sezione", group: "terra", image: "/demo/Placeholdersez1.png" },
  { id: "a-int", code: "TAV. 04", title: "Basement plan", tag: "interrato", group: "int", image: "/demo/PlaceholderPianoInterrato.png" },
  { id: "a-giar", code: "TAV. 05", title: "Garden and outbuildings", tag: "giardino", group: "giar", image: "/demo/PlaceholderGiardinoePertinenze.png" },
];

export const NEWHIRE_CASE: Sheet[] = [
  { id: "b-primo", code: "TAV. 11", title: "First floor plan (Bldg. 2)", tag: "pianta", group: "primo", image: "/demo/piano_primo.jpg" },
  { id: "b-est", code: "TAV. 12", title: "East elevation (Bldg. 2)", tag: "prospetto", group: "primo", image: "/demo/Placeholderprospettoest.png" },
  { id: "b-sez2", code: "TAV. 13", title: "Section 2 (Bldg. 2)", tag: "sezione", group: "primo", image: "/demo/Placeholdersez2.png" },
  { id: "b-int", code: "TAV. 14", title: "Basement (Bldg. 2)", tag: "interrato", group: "int2", image: "/demo/PlaceholderPianoInterrato.png" },
  { id: "b-giar", code: "TAV. 15", title: "Landscaping (Bldg. 2)", tag: "giardino", group: "giar2", image: "/demo/PlaceholderGiardinoePertinenze.png" },
];

const base = (rev: "A" | "B" | "C", phase: "Permesso" | "Esecutivo" | "Cliente" = "Permesso") => ({
  rev,
  phase,
  approval: "none" as const,
  issued: false,
  notes: [],
});

export const expertInitial = (): CaseState => ({
  "a-terra": base("B"),
  "a-sud": base("A"),
  "a-sez1": base("B"),
  "a-int": base("A"),
  "a-giar": base("A"),
});

export const newHireInitial = (): CaseState => ({
  "b-primo": base("B"),
  "b-est": base("A"),
  "b-sez2": base("B"),
  "b-int": base("A"),
  "b-giar": base("A", "Permesso"),
});
