// Dates that read the same on the server and in the browser.
//
// `new Date(x).toLocaleDateString('en-IN')` gives a different answer depending
// on where it runs, in two ways at once:
//
//   • Time zone. The server keeps UTC; the shopper's phone is on IST, five and
//     a half hours ahead. A review written at 20:00 UTC is the 27th on the
//     server and the 28th in India — same instant, different date.
//   • Locale data. Node is often built without the full ICU tables, so it does
//     not really know "en-IN" and quietly formats it as en-US instead. The
//     browser does know it. Different string, every time.
//
// React renders the page once on the server and again in the browser and
// expects the two to match. When they do not it throws away the server's work
// and, in production, reports Minified React error #329 — which is what was
// happening on every product page, because that page prints review dates.
//
// The cost was not the date. React stops hydrating at that point, and
// next/script never starts the afterInteractive scripts — so the Meta Pixel
// never loaded on a product page at all. fbq was undefined there. No
// ViewContent, no AddToCart, and nothing for Meta to retarget with.
//
// So the date is built by hand from the UTC clock plus 5:30, with the month
// names written out. No Intl, no time zone of the machine, no locale tables —
// the same characters wherever it runs.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const IST_MS = 5.5 * 60 * 60 * 1000;

function istParts(value: string | number | Date) {
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const t = new Date(d.getTime() + IST_MS);       // read the UTC fields as IST
  return {
    day: t.getUTCDate(),
    month: t.getUTCMonth(),
    year: t.getUTCFullYear(),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
  };
}

/** 28 Sep 2026 */
export function formatDateIst(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const p = istParts(value);
  return p ? `${p.day} ${MONTHS[p.month]} ${p.year}` : '';
}

/** 28 Sep 2026, 7:45 pm */
export function formatDateTimeIst(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const p = istParts(value);
  if (!p) return '';
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const ampm = p.hour < 12 ? 'am' : 'pm';
  return `${p.day} ${MONTHS[p.month]} ${p.year}, ${h12}:${String(p.minute).padStart(2, '0')} ${ampm}`;
}

/** 28 Sep — for a delivery window, where the year is noise. */
export function formatDayMonthIst(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const p = istParts(value);
  return p ? `${p.day} ${MONTHS[p.month]}` : '';
}
