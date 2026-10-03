export type FrameSource = HTMLCanvasElement | HTMLVideoElement;
export interface PiiBox {
  x: number;
  y: number;
  w: number;
  h: number;
  type?: string;
}

function dims(src: FrameSource) {
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth, h: src.videoHeight };
  return { w: src.width, h: src.height };
}

/** Disegna la sorgente su un canvas di larghezza `width` (altezza proporzionale). */
export function grab(src: FrameSource, width: number): HTMLCanvasElement | null {
  const d = dims(src);
  if (!d.w || !d.h) return null;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round((width * d.h) / d.w);
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Impronta 24x15 in scala di grigi, per scartare i fotogrammi invariati. */
export function hashFrame(src: FrameSource): Uint8Array | null {
  const c = document.createElement("canvas");
  c.width = 24;
  c.height = 15;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const d = dims(src);
  if (!ctx || !d.w) return null;
  ctx.drawImage(src, 0, 0, 24, 15);
  const px = ctx.getImageData(0, 0, 24, 15).data;
  const out = new Uint8Array(24 * 15);
  for (let i = 0; i < out.length; i++) out[i] = ((px[i * 4] ?? 0) * 0.3 + (px[i * 4 + 1] ?? 0) * 0.59 + (px[i * 4 + 2] ?? 0) * 0.11) | 0;
  return out;
}

export function hashDiff(a: Uint8Array, b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return s / a.length;
}

/** Sfoca (pixelando) le zone con dati personali. Ritorna il numero di zone sfocate. */
export function blurRegions(c: HTMLCanvasElement, boxes: PiiBox[]): number {
  const ctx = c.getContext("2d");
  if (!ctx) return 0;
  let n = 0;
  for (const b of boxes) {
    const x = Math.max(0, Math.floor(b.x * c.width));
    const y = Math.max(0, Math.floor(b.y * c.height));
    const w = Math.min(c.width - x, Math.ceil(b.w * c.width));
    const h = Math.min(c.height - y, Math.ceil(b.h * c.height));
    if (w < 2 || h < 2) continue;
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(w / 14));
    small.height = Math.max(1, Math.round(h / 14));
    const sctx = small.getContext("2d");
    if (!sctx) continue;
    sctx.drawImage(c, x, y, w, h, 0, 0, small.width, small.height);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
    ctx.restore();
    n++;
  }
  return n;
}

export const toJpeg = (c: HTMLCanvasElement, q = 0.6) => c.toDataURL("image/jpeg", q);
