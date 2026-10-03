// Livello di oscuramento compatibile con Presidio: stessi tipi di entità, stessa forma di sostituzione <ENTITY>.
// Presidio è in Python e non gira in questo runtime: se PRESIDIO_ANALYZER_URL è impostata, usa quell'Analyzer in aggiunta alle regole locali.

type Span = { start: number; end: number; entity: string };

const CAP = "[A-ZÀ-Ý][a-zà-ÿ']+";
const RULES: { entity: string; re: RegExp }[] = [
  { entity: "EMAIL_ADDRESS", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { entity: "IBAN_CODE", re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g },
  { entity: "IT_FISCAL_CODE", re: /\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b/gi },
  { entity: "IT_VAT_CODE", re: /(?:p\.?\s?iva|partita iva)[:\s]*\d{11}\b/gi },
  { entity: "CREDIT_CARD", re: /\b(?:\d[ -]?){13,16}\b/g },
  { entity: "PHONE_NUMBER", re: /(?:\+|00)39[\s.-]?\d{2,3}[\s.-]?\d{5,8}\b|\b3\d{2}[\s.-]?\d{6,7}\b|\b0\d{1,3}[\s.-]?\d{5,8}\b/g },
  {
    entity: "LOCATION",
    re: new RegExp(`\\b(?:[Vv]ia|[Vv]iale|[Pp]iazza|[Cc]orso|[Ll]argo|[Vv]icolo)\\s+(?:(?:dei|degli|delle|del|della|di|da|d')\\s*)?${CAP}(?:\\s+${CAP})*(?:,?\\s*(?:n\\.?\\s*)?\\d{1,4}[A-Za-z]?)?`, "g"),
  },
  {
    entity: "PERSON",
    re: new RegExp(`\\b(?:Sig\\.?ra|Sig\\.?|Signor[ae]?|Ing\\.?|Geom\\.?|Dott\\.?(?:ssa)?|Avv\\.?|Prof\\.?(?:ssa)?|[Cc]liente|[Pp]roprietari[oa])\\s+${CAP}(?:\\s+${CAP})?`, "g"),
  },
];

async function presidioSpans(text: string): Promise<Span[]> {
  const url = process.env["PRESIDIO_ANALYZER_URL"];
  if (!url) return [];
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: "it" }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { entity_type: string; start: number; end: number; score: number }[];
    return data.filter((d) => d.score >= 0.5).map((d) => ({ start: d.start, end: d.end, entity: d.entity_type }));
  } catch {
    return [];
  }
}

export async function redactText(text: string): Promise<{ text: string; count: number; entities: Record<string, number> }> {
  if (!text) return { text, count: 0, entities: {} };
  const spans: Span[] = [];
  for (const r of RULES) {
    for (const m of text.matchAll(r.re)) {
      if (m.index === undefined) continue;
      spans.push({ start: m.index, end: m.index + m[0].length, entity: r.entity });
    }
  }
  spans.push(...(await presidioSpans(text)));
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start < last.end) {
      if (s.end > last.end) last.end = s.end;
    } else merged.push({ ...s });
  }
  let out = "";
  let pos = 0;
  const entities: Record<string, number> = {};
  for (const s of merged) {
    out += text.slice(pos, s.start) + `<${s.entity}>`;
    pos = s.end;
    entities[s.entity] = (entities[s.entity] ?? 0) + 1;
  }
  out += text.slice(pos);
  return { text: out, count: merged.length, entities };
}

export async function redactMany(texts: string[]) {
  let count = 0;
  const entities: Record<string, number> = {};
  const out: string[] = [];
  for (const t of texts) {
    const r = await redactText(t);
    out.push(r.text);
    count += r.count;
    for (const [k, v] of Object.entries(r.entities)) entities[k] = (entities[k] ?? 0) + v;
  }
  return { texts: out, count, entities };
}
