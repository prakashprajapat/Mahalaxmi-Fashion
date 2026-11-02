import type { Order } from '@/types';
import { buildLabelBody, LABEL_CSS, labelFileName, C128_TABLE } from './orderLabel';

// The shipping label as a PDF file that downloads on one click.
//
// The Label button used to open a print window, and a label only became a file
// after "Save as PDF" in the print dialog - three more clicks per parcel, and a
// pop-up blocker could stop it altogether. This draws the SAME label (same HTML,
// same CSS) at 300 dpi and writes it into a 4x6 inch PDF, one page per order.
//
// No library: the deploy never runs npm install, so a new package would break
// the build. The label is rasterised through an SVG <foreignObject>, and the PDF
// is a handful of objects written by hand - a JPEG per page needs nothing more.

const PAGE_W_IN = 4;
const PAGE_H_IN = 6;
const CSS_DPI = 96;          // 1in in CSS pixels
const OUT_DPI = 300;         // what a 203/300 dpi thermal printer can use
const W = PAGE_W_IN * CSS_DPI;   // 384 css px
const H = PAGE_H_IN * CSS_DPI;   // 576 css px

// CODE128-B, the same encoding the print window draws.
function code128Rects(code: string): { rects: string; total: number } {
  const t = code.replace(/[^ -~]/g, '');
  const codes = [104];
  let sum = 104;
  for (let i = 0; i < t.length; i++) codes.push(t.charCodeAt(i) - 32);
  for (let i = 0; i < t.length; i++) sum += (t.charCodeAt(i) - 32) * (i + 1);
  codes.push(sum % 103, 106);
  const widths = codes.map(c => C128_TABLE[c] ?? '').join('');
  let x = 0, rects = '';
  for (let i = 0; i < widths.length; i++) {
    const w = +widths[i];
    if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="40"/>`;
    x += w;
  }
  return { rects, total: x };
}

// A picture from another site, as a data: URL, so it travels inside the SVG.
// The QR service sends CORS headers; if it ever stops, the QR is left out
// rather than the whole label failing - the barcode carries the same number.
async function toDataUrl(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 6000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch { resolve(null); }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

async function labelToJpeg(order: Order): Promise<{ bytes: Uint8Array; px: number; py: number }> {
  // Parse the label as HTML, fix it up, then serialise it as XHTML: an SVG
  // foreignObject only accepts well-formed XML (no &middot;, no bare <img>).
  const holder = document.createElement('div');
  holder.innerHTML = buildLabelBody(order);

  for (const svg of Array.from(holder.querySelectorAll('svg.bc'))) {
    const { rects, total } = code128Rects(svg.getAttribute('data-code') ?? '');
    svg.setAttribute('viewBox', `0 0 ${total} 40`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('fill', '#000');
    svg.innerHTML = rects;
  }
  for (const img of Array.from(holder.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    if (src.startsWith('data:')) continue;
    const data = await toDataUrl(src);
    if (data) img.setAttribute('src', data); else img.remove();
  }

  const css = LABEL_CSS.replace(/@page\{[^}]*\}/g, '').replace(/@media screen\{[^}]*\}\}/g, '');
  const pageStyle = `width:${W}px;box-sizing:border-box;padding:5mm;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111`;

  // How tall the label really is. A long order (four or five lines) runs past
  // 6 inches, and the print window spilled it onto a second sheet; a picture
  // would simply cut the bottom off - the payment box and the note with it.
  // Laid out once in a shadow root (so the label's CSS cannot touch the admin
  // page), measured, and the whole label is then scaled to fit one page.
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden';
  document.body.appendChild(probe);
  let contentH = H;
  try {
    const root = probe.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${css}</style><div style="${pageStyle}">${holder.innerHTML}</div>`;
    await Promise.all(Array.from(root.querySelectorAll('img')).map(i => i.decode().catch(() => undefined)));
    const box = root.lastElementChild as HTMLElement;
    contentH = Math.max(H, Math.ceil(box.getBoundingClientRect().height));
  } finally {
    probe.remove();
  }

  // Taller than the page: shrink it evenly and centre it, never crop it.
  const scale = contentH / H;
  const vbW = W * scale;
  const xhtml = new XMLSerializer().serializeToString(holder);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W_IN * OUT_DPI}" height="${PAGE_H_IN * OUT_DPI}" viewBox="${-(vbW - W) / 2} 0 ${vbW} ${contentH}">` +
    `<foreignObject x="0" y="0" width="${W}" height="${contentH}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="${pageStyle};min-height:${contentH}px">` +
    `<style>${css}</style>` +
    xhtml +
    `</div></foreignObject></svg>`;

  const img = new Image();
  img.width = PAGE_W_IN * OUT_DPI;
  img.height = PAGE_H_IN * OUT_DPI;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('The label could not be drawn.'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });

  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W_IN * OUT_DPI;
  canvas.height = PAGE_H_IN * OUT_DPI;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The label could not be saved.'))), 'image/jpeg', 0.95));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), px: canvas.width, py: canvas.height };
}

// A minimal PDF: one 4x6in page per label, each page one full-bleed JPEG.
function buildPdf(pages: { bytes: Uint8Array; px: number; py: number }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Uint8Array | string) => {
    const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(b); length += b.length;
  };
  const obj = (n: number, body: () => void) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };

  const ptW = PAGE_W_IN * 72, ptH = PAGE_H_IN * 72;
  const n = pages.length;
  // 1 catalog, 2 pages, then per label: page, content, image.
  const pageNum = (i: number) => 3 + i * 3;

  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageNum(i)} 0 R`).join(' ')}] >>`));
  pages.forEach((p, i) => {
    const pg = pageNum(i), content = pg + 1, image = pg + 2;
    obj(pg, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW} ${ptH}] /Resources << /XObject << /Im${i} ${image} 0 R >> >> /Contents ${content} 0 R >>`));
    const draw = `q ${ptW} 0 0 ${ptH} 0 0 cm /Im${i} Do Q`;
    obj(content, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
    obj(image, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.px} /Height ${p.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
      push(p.bytes);
      push('\nendstream');
    });
  });

  const total = 3 + n * 3;
  const xref = length;
  let table = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

/** Draw the labels and save them as one PDF, named like the print version was. */
export async function downloadLabelsPdf(list: Order[]): Promise<void> {
  if (!list.length) return;
  const pages = [];
  for (const o of list) pages.push(await labelToJpeg(o));
  const blob = buildPdf(pages);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${labelFileName(list)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
