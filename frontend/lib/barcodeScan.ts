/**
 * Reads barcodes and QR codes from a live <video>.
 *
 * Chrome on Android has the browser's own BarcodeDetector, which is fast and
 * free. Safari on the iPhone (and Firefox) does not, which is why Pack & Scan
 * used to say "This browser cannot read barcodes" there. For those, ZXing - a
 * plain-JavaScript decoder - is loaded once, only when the camera is opened,
 * from a pinned version with an integrity hash: if a single byte of that file
 * differs from the one checked here, the browser refuses to run it.
 */

export interface FrameReader {
  /** The text of a code in this frame, or null when there is none. */
  read(v: HTMLVideoElement): Promise<string | null>;
  engine: 'native' | 'zxing';
}

// Pinned. Changing the version means changing the hash (and next.config.js).
export const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
const ZXING_SRI = 'sha384-BzBxP10ZE72aitqj5UMmUsbKFliP/DZqA8Wq+BNNhlIJDGoEd1tpkMYXOg9+n6sB';

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?(): Promise<string[]>;
}

const WANT_NATIVE = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'itf', 'codabar', 'qr_code', 'data_matrix'];

let zxingPromise: Promise<any> | null = null;
function loadZxing(): Promise<any> {
  const w = window as any;
  if (w.ZXing) return Promise.resolve(w.ZXing);
  if (zxingPromise) return zxingPromise;
  zxingPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ZXING_URL;
    s.integrity = ZXING_SRI;
    s.crossOrigin = 'anonymous';
    s.async = true;
    s.onload = () => (w.ZXing ? resolve(w.ZXing) : reject(new Error('Scanner did not load')));
    s.onerror = () => { zxingPromise = null; reject(new Error('Could not load the barcode reader. Check the internet and try again.')); };
    document.head.appendChild(s);
  });
  return zxingPromise;
}

async function nativeReader(): Promise<FrameReader | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? WANT_NATIVE;
    const formats = WANT_NATIVE.filter(f => supported.includes(f));
    // A detector that cannot read Code 128 cannot read a Delhivery label.
    if (!formats.includes('code_128')) return null;
    const det = new Ctor({ formats });
    return {
      engine: 'native',
      async read(v) {
        if (v.readyState < 2) return null;
        const hit = (await det.detect(v)).find(f => f.rawValue?.trim());
        return hit ? hit.rawValue.trim() : null;
      },
    };
  } catch {
    return null;
  }
}

async function zxingReader(): Promise<FrameReader> {
  const Z = await loadZxing();
  const hints = new Map();
  const F = Z.BarcodeFormat;
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
    F.CODE_128, F.CODE_39, F.CODE_93, F.EAN_13, F.EAN_8, F.UPC_A, F.ITF, F.CODABAR, F.QR_CODE, F.DATA_MATRIX,
  ]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  let turn = 0;

  const decode = () => {
    try {
      const src = new Z.HTMLCanvasElementLuminanceSource(canvas);
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(src));
      const r = reader.decodeWithState(bmp);
      const t = r?.getText?.();
      return t && String(t).trim() ? String(t).trim() : null;
    } catch {
      return null;           // NotFound on most frames - normal
    } finally {
      try { reader.reset(); } catch { /* */ }
    }
  };

  return {
    engine: 'zxing',
    async read(v) {
      const vw = v.videoWidth, vh = v.videoHeight;
      if (v.readyState < 2 || !vw || !vh) return null;
      // Alternate between the middle of the picture at full sharpness (where
      // the aiming box is - a thin barcode needs every pixel) and the whole
      // picture made smaller (a QR held a little off-centre).
      turn++;
      if (turn % 2 === 1) {
        const cw = Math.round(vw * 0.8), ch = Math.round(vh * 0.5);
        const sx = Math.round((vw - cw) / 2), sy = Math.round((vh - ch) / 2);
        const scale = Math.min(1, 1280 / cw);
        canvas.width = Math.round(cw * scale); canvas.height = Math.round(ch * scale);
        ctx.drawImage(v, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
      } else {
        const scale = Math.min(1, 960 / Math.max(vw, vh));
        canvas.width = Math.round(vw * scale); canvas.height = Math.round(vh * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      }
      return decode();
    },
  };
}

/** The best reader this browser can run. Throws only if neither works. */
export async function makeFrameReader(): Promise<FrameReader> {
  return (await nativeReader()) ?? zxingReader();
}

/** The back camera, sharp enough for a thin Code 128. */
export async function openBackCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    const e = new Error('This browser cannot open the camera.'); (e as { name?: string }).name = 'NotSupported';
    throw e;
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (e) {
    // Some phones refuse the size; try again with nothing but "the back one".
    if ((e as { name?: string })?.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment' } });
    }
    throw e;
  }
}

export function cameraErrorText(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  return name === 'NotAllowedError' ? 'Camera access was refused. Allow the camera for this site (Settings → Safari → Camera on iPhone), then try again.'
    : name === 'NotFoundError' ? 'No camera was found on this device.'
    : name === 'NotReadableError' ? 'The camera is being used by another app. Close it and try again.'
    : name === 'SecurityError' ? 'The camera needs a secure (https) connection.'
    : name === 'NotSupported' ? 'This browser cannot open the camera.'
    : ((e as Error)?.message || 'The camera could not be opened.');
}

/** True on a phone or tablet - where the camera should open by itself. */
export function isTouchPhone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches && Math.min(window.innerWidth, window.innerHeight) < 900;
  } catch { return false; }
}
