import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Approval, CaseState, Phase, Rev, Sheet, UiAction } from "@/lib/types";
import type { PiiBox } from "@/lib/frames";

const W = 1120;
const H = 700;
const INK = "#1b1b1e";
const PAPER = "#f6f3ec";
const RED = "#d8392c";
const GREEN = "#2f7d4f";
const AMBER = "#b8791a";

/** Zone con dati personali sempre presenti nel cartiglio (committente): note all'app, sfocate prima del salvataggio. */
export const VIEWER_PII_BOXES: PiiBox[] = [{ x: 0.5, y: 0.935, w: 0.485, h: 0.05, type: "PERSON" }];

const imgCache = new Map<string, HTMLImageElement>();
function loadImg(src: string, done: () => void) {
  const hit = imgCache.get(src);
  if (hit) return hit.complete ? hit : null;
  const im = new Image();
  im.onload = done;
  im.src = src;
  imgCache.set(src, im);
  return null;
}

/** Classifica uno schizzo in parole (fatto certo per Marta e per la visione). */
export function describeSketch(pts: [number, number][]): string {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const where = `${cy < 0.33 ? "at the top" : cy > 0.66 ? "at the bottom" : "in the centre"}${cx < 0.33 ? " on the left" : cx > 0.66 ? " on the right" : ""}`;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  const first = pts[0]!, last = pts[pts.length - 1]!;
  const gap = Math.hypot(first[0] - last[0], first[1] - last[1]);
  const span = Math.hypot(maxX - minX, maxY - minY);
  let shape = "a freehand sketch";
  if (span < 0.03) shape = "a quick mark";
  else if (gap < span * 0.3 && len > span * 2) shape = "a circle around an area";
  else if (len < span * 1.15) shape = Math.abs(maxX - minX) > Math.abs(maxY - minY) * 3 ? "a horizontal line (dimension or alignment)" : Math.abs(maxY - minY) > Math.abs(maxX - minX) * 3 ? "a vertical line (dimension or alignment)" : "a diagonal line / arrow";
  else if (len > span * 4) shape = "dense hatching / shading";
  return `${shape} ${where} of the sheet`;
}

const REVS: Rev[] = ["A", "B", "C"];
const PHASES: Phase[] = ["Permesso", "Esecutivo", "Cliente"];
const PHASE_LABEL: Record<Phase, string> = { Permesso: "Permit", Esecutivo: "Construction", Cliente: "Client" };
const APPROVALS: { v: Approval; label: string }[] = [
  { v: "approved", label: "Approve" },
  { v: "held", label: "Hold" },
  { v: "second", label: "Second approval" },
];
const APPROVAL_TXT: Record<Approval, string> = { none: "—", approved: "APPROVED", held: "ON HOLD", second: "2ND APPROVAL" };

interface Props {
  sheets: Sheet[];
  state: CaseState;
  selectedId: string;
  onSelect: (id: string) => void;
  dispatch: (a: UiAction) => void;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  issueLabel?: string;
  disabled?: boolean;
  highlight?: boolean;
  /** true mentre l'esperto sta tracciando uno schizzo */
  onDrawing?: (drawing: boolean) => void;
}

export function TavoleViewer({ sheets, state, selectedId, onSelect, dispatch, canvasRef, issueLabel = "Issue sheet", disabled, highlight, onDrawing }: Props) {
  const [tick, setTick] = useState(0);
  const [annotate, setAnnotate] = useState(false);
  const [pen, setPen] = useState(false);
  const live = useRef<[number, number][] | null>(null);
  const sheet = (sheets.find((s) => s.id === selectedId) ?? sheets[0])!;
  const st = state[sheet.id]!;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !st) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    // griglia
    ctx.strokeStyle = "rgba(27,27,30,0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    // tavola
    const area = { x: 24, y: 64, w: W - 48, h: H - 64 - 112 };
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(area.x, area.y, area.w, area.h);
    const im = loadImg(sheet.image, () => setTick((n) => n + 1));
    if (im && im.naturalWidth) {
      const r = Math.min((area.w - 16) / im.naturalWidth, (area.h - 16) / im.naturalHeight);
      const dw = im.naturalWidth * r;
      const dh = im.naturalHeight * r;
      ctx.drawImage(im, area.x + (area.w - dw) / 2, area.y + (area.h - dh) / 2, dw, dh);
    }
    // testata
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, 48);
    ctx.fillStyle = PAPER;
    ctx.font = "700 20px 'Space Mono', monospace";
    ctx.textBaseline = "middle";
    ctx.fillText(`${sheet.code}  ·  ${sheet.title.toUpperCase()}`, 24, 25);
    ctx.textAlign = "right";
    ctx.font = "400 14px 'Space Mono', monospace";
    ctx.fillText("VILLA HORIZON — DRAWING VIEWER", W - 24, 25);
    ctx.textAlign = "left";
    // cartiglio
    const by = H - 100;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, by - 8, W, 108);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, by - 8);
    ctx.lineTo(W, by - 8);
    ctx.stroke();
    const tiles: [string, string, string][] = [
      ["REV", st.rev, INK],
      ["PHASE", PHASE_LABEL[st.phase].toUpperCase(), INK],
      ["STATUS", APPROVAL_TXT[st.approval], st.approval === "held" ? AMBER : st.approval === "none" ? INK : GREEN],
      ["ISSUE", st.issued ? "ISSUED" : "DRAFT", st.issued ? RED : INK],
    ];
    tiles.forEach(([k, v, col], i) => {
      const x = 24 + i * 140;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, by + 4, 128, 56);
      ctx.fillStyle = "rgba(27,27,30,0.55)";
      ctx.font = "700 11px 'Space Mono', monospace";
      ctx.fillText(k, x + 8, by + 17);
      ctx.fillStyle = col;
      ctx.font = "800 20px 'Space Mono', monospace";
      ctx.fillText(v, x + 8, by + 42);
    });
    // committente (dato personale)
    ctx.fillStyle = INK;
    ctx.font = "400 13px 'Space Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText("CLIENT: Mr Mario Rossi · 12 Via Verdi, Lecco · m.rossi@example.it", W - 24, H - 20);
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(27,27,30,0.55)";
    ctx.font = "400 12px 'Space Mono', monospace";
    ctx.fillText(`Linked sheets: ${sheets.filter((s) => s.group === sheet.group).map((s) => `${s.code.replace("TAV. ", "")}/${state[s.id]?.rev}`).join("  ")}`, 24, H - 20);
    // timbro
    if (st.approval !== "none" || st.issued) {
      ctx.save();
      ctx.translate(W - 190, 140);
      ctx.rotate(-0.12);
      const txt = st.issued ? "ISSUED" : APPROVAL_TXT[st.approval];
      const col = st.issued ? RED : st.approval === "held" ? AMBER : GREEN;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 4;
      ctx.font = "800 30px 'Space Mono', monospace";
      const tw = ctx.measureText(txt).width + 28;
      ctx.strokeRect(-tw / 2, -26, tw, 52);
      ctx.textAlign = "center";
      ctx.fillText(txt, 0, 2);
      ctx.restore();
    }
    // schizzi dell'esperto (matita rossa)
    const strokes = [...(st.sketches ?? []).map((k) => k.pts), ...(live.current ? [live.current] : [])];
    ctx.save();
    ctx.strokeStyle = RED;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokes.forEach((pts) => {
      ctx.beginPath();
      pts.forEach(([nx, ny], i) => {
        const x = area.x + nx * area.w;
        const y = area.y + ny * area.h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.restore();
    // annotazioni
    st.notes.forEach((n, i) => {
      const x = area.x + n.x * area.w;
      const y = area.y + n.y * area.h;
      ctx.fillStyle = RED;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.font = "800 14px 'Space Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), x, y + 1);
      ctx.textAlign = "left";
    });
  }, [sheet, st, state, sheets, tick, canvasRef]);

  const toNorm = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    return [Math.min(1, Math.max(0, (px - 24) / (W - 48))), Math.min(1, Math.max(0, (py - 64) / (H - 64 - 112)))];
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pen || disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current = [toNorm(e)];
    onDrawing?.(true);
    setTick((n) => n + 1);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!live.current) return;
    live.current.push(toNorm(e));
    setTick((n) => n + 1);
  };
  const onUp = () => {
    const pts = live.current;
    live.current = null;
    onDrawing?.(false);
    if (!pts || pts.length < 3) return setTick((n) => n + 1);
    const r = (v: number) => Math.round(v * 1000) / 1000;
    const slimPts = pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1).map(([x, y]) => [r(x), r(y)] as [number, number]);
    dispatch({ type: "sketch", sheetId: sheet.id, value: JSON.stringify(slimPts), label: describeSketch(pts) });
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!annotate || disabled) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    const x = Math.min(1, Math.max(0, (px - 24) / (W - 48)));
    const y = Math.min(1, Math.max(0, (py - 64) / (H - 64 - 112)));
    dispatch({ type: "annotate", sheetId: sheet.id, value: `${x.toFixed(3)},${y.toFixed(3)}` });
    setAnnotate(false);
  };

  return (
    <div className={`frame ${highlight ? "outline outline-2 outline-[var(--color-accent)]" : ""}`}>
      <div className="flex flex-wrap gap-1 border-b p-2">
        {sheets.map((s) => (
          <button
            key={s.id}
            data-testid={`tab-${s.id}`}
            disabled={disabled}
            onClick={() => {
              if (s.id !== sheet.id) {
                onSelect(s.id);
                dispatch({ type: "select", sheetId: s.id });
              }
            }}
            className={`border px-2.5 py-1.5 text-[0.65rem] font-bold uppercase tracking-wide ${s.id === sheet.id ? "bg-foreground text-background" : "hover:bg-secondary"} disabled:opacity-50`}
          >
            {s.code.replace("TAV. ", "")} · {s.title}
            {state[s.id]?.issued && <span className="ml-1 text-[var(--color-accent)]">●</span>}
          </button>
        ))}
      </div>
      <canvas
        ref={(el) => {
          canvasRef.current = el;
        }}
        width={W}
        height={H}
        data-testid="tavole-canvas"
        onClick={onCanvasClick}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={pen ? { touchAction: "none" } : undefined}
        className={`block w-full ${annotate || pen ? "cursor-crosshair" : ""}`}
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t p-2">
        <Group label="Rev">
          {REVS.map((r) => (
            <Chip key={r} on={st.rev === r} disabled={disabled} onClick={() => st.rev !== r && dispatch({ type: "rev", sheetId: sheet.id, value: r, before: st.rev })}>
              {r}
            </Chip>
          ))}
        </Group>
        <Group label="Phase">
          {PHASES.map((p) => (
            <Chip key={p} on={st.phase === p} disabled={disabled} onClick={() => st.phase !== p && dispatch({ type: "phase", sheetId: sheet.id, value: p, before: st.phase })}>
              {PHASE_LABEL[p]}
            </Chip>
          ))}
        </Group>
        <Group label="Approval">
          {APPROVALS.map((a) => (
            <Chip
              key={a.v}
              on={st.approval === a.v}
              disabled={disabled}
              onClick={() => dispatch({ type: "approval", sheetId: sheet.id, value: st.approval === a.v ? "none" : a.v, before: st.approval })}
            >
              {a.label}
            </Chip>
          ))}
        </Group>
        <Chip on={pen} disabled={disabled} data-testid="btn-pen" onClick={() => { setPen((v) => !v); setAnnotate(false); }}>
          {pen ? "✎ Sketching…" : "✎ Sketch"}
        </Chip>
        <Chip on={annotate} disabled={disabled} onClick={() => { setAnnotate((v) => !v); setPen(false); }}>
          {annotate ? "Click the sheet" : "Annotate"}
        </Chip>
        <button
          data-testid="btn-issue"
          disabled={disabled || st.issued}
          onClick={() => dispatch({ type: "issue", sheetId: sheet.id })}
          className="btn btn-accent ml-auto"
        >
          {st.issued ? "Issued" : issueLabel}
        </button>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, children, ...p }: { on?: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`border px-2.5 py-1.5 text-[0.65rem] font-bold uppercase tracking-wide disabled:opacity-40 ${on ? "bg-foreground text-background" : "hover:bg-secondary"}`}
    >
      {children}
    </button>
  );
}
