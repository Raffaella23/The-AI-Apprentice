import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { describeFrameDiff, findPiiBoxes } from "@/lib/apprentice.functions";
import { blurRegions, grab, hashDiff, hashFrame, toJpeg, type FrameSource, type PiiBox } from "@/lib/frames";

export interface CapturedEvent {
  frame: string;
  action: string;
  summary: string;
  significance: "low" | "high";
  blurred: number;
}

interface Opts {
  running: boolean;
  offRecord: boolean;
  getSource: () => FrameSource | null;
  getKnownPii: () => PiiBox[];
  getHint: () => string;
  onEvent: (e: CapturedEvent) => void;
  onDropped: () => void;
  onBusy?: (busy: boolean) => void;
}

/** Ogni 2 secondi cattura un fotogramma; se è cambiato aspetta che si fermi, sfoca le PII, e chiede alla visione cosa è successo. */
export function useCaptureEngine(opts: Opts) {
  const o = useRef(opts);
  o.current = opts;
  const diff = useServerFn(describeFrameDiff);
  const pii = useServerFn(findPiiBoxes);
  const lastChangeAt = useRef(Date.now());
  const analyzing = useRef(false);
  const lastFrame = useRef<string | null>(null);

  useEffect(() => {
    if (!opts.running) return;
    let baseline: Uint8Array | null = null;
    let pending = false;
    lastChangeAt.current = Date.now();

    const analyze = async () => {
      const src = o.current.getSource();
      if (!src) return;
      const c = grab(src, 560);
      if (!c) return;
      analyzing.current = true;
      o.current.onBusy?.(true);
      try {
        const known = o.current.getKnownPii();
        let found: PiiBox[] = [];
        try {
          const r = await pii({ data: { frame: toJpeg(c, 0.5) } });
          found = r.boxes;
        } catch (e) {
          console.error("pii", e);
        }
        const blurred = blurRegions(c, [...known, ...found]);
        const frame = toJpeg(c, 0.55);
        const hint = o.current.getHint();
        const res = await diff({ data: { prev: lastFrame.current ?? undefined, curr: frame, hint: hint || "(nessuna azione registrata dall'app: schermo condiviso)" } });
        lastFrame.current = frame;
        o.current.onEvent({ frame, action: res.action, summary: res.summary, significance: res.significance ?? "low", blurred });
      } catch (e) {
        console.error("analyze", e);
      } finally {
        analyzing.current = false;
        o.current.onBusy?.(false);
      }
    };

    const id = window.setInterval(() => {
      const cur = o.current;
      if (cur.offRecord) {
        // fuori registrazione: nessun fotogramma viene letto né salvato
        baseline = null;
        pending = false;
        cur.onDropped();
        return;
      }
      const src = cur.getSource();
      if (!src) return;
      const h = hashFrame(src);
      if (!h) return;
      if (!baseline) {
        baseline = h;
        lastChangeAt.current = Date.now();
        return;
      }
      if (hashDiff(h, baseline) > 2.5) {
        baseline = h;
        pending = true;
        lastChangeAt.current = Date.now();
        return;
      }
      if (pending && !analyzing.current) {
        pending = false;
        void analyze();
      }
    }, 2000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.running]);

  return { lastChangeAt, analyzing, resetKeyframe: () => (lastFrame.current = null) };
}
