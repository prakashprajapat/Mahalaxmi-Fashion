import type { Order } from '@/types';
import { ordersApi } from '@/lib/api';

// The courier's own 2D codes, lifted off its label onto ours.
//
// A Shiprocket waybill (Amazon Shipping and the rest) is sorted by the two
// square codes on the courier's label, not by a plain AWB barcode alone. Our
// label is the one on the parcel, so it has to carry them: code - barcode -
// code across the AWB box. Only for Shiprocket; Delhivery reads our barcode.
//
// The server hands over the label's picture (lib/api courierLabelImage). The
// codes are found by shape, not by position, so a different courier's layout
// still works: ink is smeared into solid blobs (a morphological close), and a
// blob that is square, solidly filled and about half ink - which text, the
// big AWB barcode and the boxes never are - is a 2D code.

export const isShiprocketOrder = (o: Order): boolean =>
  !!o.awb && /^shiprocket/i.test(o.courier || '');

type Box = { x: number; y: number; w: number; h: number };

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('label image')); };
    img.src = url;
  });
}

// Sum of a 0/1 grid over every box, in O(1) per box.
function integral(src: Uint8Array, W: number, H: number): Int32Array {
  const I = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += src[y * W + x];
      I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row;
    }
  }
  return I;
}

function boxSum(I: Int32Array, W: number, H: number, x: number, y: number, r: number): number {
  const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r);
  const x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1);
  const S = W + 1;
  return I[y1 * S + x1] - I[y0 * S + x1] - I[y1 * S + x0] + I[y0 * S + x0];
}

export function findCodeBoxes(ink: Uint8Array, W: number, H: number): Box[] {
  // Close: dilate, then erode, with an 11px square at 812px width.
  const r = Math.max(3, Math.round(W / 160));
  const I1 = integral(ink, W, H);
  const dil = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dil[y * W + x] = boxSum(I1, W, H, x, y, r) > 0 ? 1 : 0;
  const I2 = integral(dil, W, H);
  const closed = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r);
    const area = (Math.min(W, x + r + 1) - x0) * (Math.min(H, y + r + 1) - y0);
    closed[y * W + x] = boxSum(I2, W, H, x, y, r) === area ? 1 : 0;
  }

  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const out: (Box & { a: number })[] = [];
  for (let start = 0; start < W * H; start++) {
    if (!closed[start] || seen[start]) continue;
    let top = 0, a = 0;
    stack[top++] = start; seen[start] = 1;
    let minX = W, minY = H, maxX = 0, maxY = 0;
    while (top) {
      const p = stack[--top];
      const x = p % W, y = (p / W) | 0;
      a++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && closed[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < W - 1 && closed[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && closed[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[top++] = p - W; }
      if (y < H - 1 && closed[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[top++] = p + W; }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (w < W * 0.07 || h < W * 0.07 || w > W * 0.45 || h > W * 0.45) continue;
    const ratio = w / h;
    if (ratio < 0.8 || ratio > 1.25) continue;
    if (a / (w * h) < 0.7) continue;
    let dark = 0;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) dark += ink[y * W + x];
    const d = dark / (w * h);
    if (d < 0.3 || d > 0.7) continue;
    out.push({ x: minX, y: minY, w, h, a });
  }
  // The two biggest, read left to right (then top to bottom) as on the label.
  return out.sort((p, q) => q.a - p.a).slice(0, 2)
    .sort((p, q) => (Math.abs(p.y - q.y) < p.h / 2 ? p.x - q.x : p.y - q.y));
}

/** Data URLs of the courier's 2D codes (0-2 of them), or [] when there are none. */
export async function courierCodes(order: Order, token: string): Promise<string[]> {
  if (!isShiprocketOrder(order)) return [];
  const img = await loadImage(await ordersApi.courierLabelImage(order.id, token));
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, W, H).data;
  const ink = new Uint8Array(W * H);
  let dark = 0;
  for (let i = 0; i < W * H; i++) {
    const lum = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    ink[i] = lum < 128 ? 1 : 0; dark += ink[i];
  }
  if (dark > W * H / 2) for (let i = 0; i < W * H; i++) ink[i] ^= 1; // a negative image

  return findCodeBoxes(ink, W, H).map(b => {
    const m = Math.round(Math.max(b.w, b.h) * 0.06); // the quiet zone
    const side = Math.max(b.w, b.h) + 2 * m;
    const o = document.createElement('canvas');
    o.width = side; o.height = side;
    const g = o.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, side, side);
    g.imageSmoothingEnabled = false;
    g.drawImage(c, b.x, b.y, b.w, b.h, (side - b.w) / 2, (side - b.h) / 2, b.w, b.h);
    return o.toDataURL('image/png');
  });
}

/** Codes for every Shiprocket order in the list, keyed by order id. A failure leaves that order on our usual label. */
export async function courierCodesFor(list: Order[], token: string): Promise<Record<string, string[]>> {
  const map: Record<string, string[]> = {};
  for (const o of list) {
    if (!isShiprocketOrder(o)) continue;
    try {
      const codes = await courierCodes(o, token);
      if (codes.length) map[o.id] = codes;
    } catch (e) { console.warn('Courier codes for', o.id, e); }
  }
  return map;
}
