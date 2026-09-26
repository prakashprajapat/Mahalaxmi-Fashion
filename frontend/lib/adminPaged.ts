// Loading a paged admin list all the way to the end.
//
// The lead pages fetched one page of fifty and then searched, counted and
// exported that page. So "Today: 3" meant three on this page, a search for a
// customer sitting on page 2 found nothing, and Export CSV wrote fifty rows
// however many leads there were. None of it said so.
//
// These lists are hundreds of rows, not millions, so the honest fix is to load
// them. The server caps a page at 200; this walks the pages until it has
// everything, stops at `max` to keep a runaway list from hanging the browser,
// and says when it stopped early so the page can admit it.

export interface AllPages<T> {
  rows: T[];
  /** What the server says exists in total — which may be more than `rows`. */
  total: number;
  /** True when `max` was reached before the end. */
  truncated: boolean;
  /** The first page's body, for anything else it carried (unread counts and such). */
  first: Record<string, unknown>;
}

export async function fetchAllPages<T>(
  urlFor: (page: number, limit: number) => string,
  rowsOf: (body: Record<string, unknown>) => T[],
  token: string,
  opts: { limit?: number; max?: number } = {},
): Promise<AllPages<T>> {
  const limit = opts.limit ?? 200;
  const max = opts.max ?? 2000;
  const rows: T[] = [];
  let total = 0;
  let first: Record<string, unknown> = {};

  for (let page = 1; ; page++) {
    const res = await fetch(urlFor(page, limit), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const body = (await res.json()) as Record<string, unknown>;
    if (page === 1) {
      first = body;
      total = Number(body.total ?? 0);
    }
    const batch = rowsOf(body);
    rows.push(...batch);
    // Stop on a short page (the end), on the declared total, or at the cap.
    if (batch.length < limit || rows.length >= total || rows.length >= max) {
      return { rows, total: total || rows.length, truncated: rows.length < total, first };
    }
  }
}

/** One CSV download, from rows already in hand. */
export function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
