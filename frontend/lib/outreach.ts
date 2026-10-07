// Who has already been written to, as the two admin screens need it.
//
// The tick used to live in the page's own memory, so logging out wiped it and
// every customer looked unwritten-to again. The same person could then be mailed
// twice on Tuesday and twice more on Wednesday, with nothing to show it had
// happened. It is kept in the database now; this is the thin layer that reads
// and writes it.

export type Audience = 'customer' | 'lead';
export type Channel = 'email' | 'whatsapp';

export interface SendRecord {
  sentAt: string;
  times: number;
}

/** Keyed `${personId}:${channel}` — the shape a table row asks its question in. */
export type SendMap = Record<string, SendRecord>;

export const sendKey = (personId: number, channel: Channel) => `${personId}:${channel}`;

export async function fetchSends(audience: Audience, token: string): Promise<SendMap> {
  const res = await fetch(`/api/outreach/sends?audience=${audience}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return {};
  const body = await res.json().catch(() => null);
  const map: SendMap = {};
  for (const row of body?.sends ?? []) {
    map[sendKey(row.personId, row.channel)] = { sentAt: row.sentAt, times: row.times ?? 1 };
  }
  return map;
}

/**
 * Report a send the server could not see for itself.
 *
 * Only WhatsApp needs this. WhatsApp is a link: the browser hands the chat over
 * and the server never hears another word, so the page says so afterwards. The
 * email endpoints write their own row, and only once the mail server has taken
 * the message — a tick that appears when nothing was sent is worse than no tick.
 *
 * It is a claim, not a receipt. Nothing here proves the shop pressed Send in
 * WhatsApp, and the wording on screen says "opened", not "delivered".
 */
export async function recordSend(
  audience: Audience,
  personId: number,
  channel: Channel,
  token: string,
): Promise<boolean> {
  try {
    const res = await fetch('/api/outreach/sent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ audience, personId, channel }),
    });
    return res.ok;
  } catch {
    return false;      // the chat still opened; the note is the only casualty
  }
}

/** "7 Oct" — enough to answer "was that recent?" without crowding the row. */
export function shortDate(raw?: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
