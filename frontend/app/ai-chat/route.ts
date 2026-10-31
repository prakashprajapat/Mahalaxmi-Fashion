import { NextResponse } from 'next/server';

// AI chatbot backend for Mahalaxmi Fashion Hub.
// Path is /ai-chat (NOT /api/*) so Next.js serves it directly instead of proxying to the .NET backend.
// The OpenAI key stays server-side (never exposed to the browser).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';
const SITE = 'https://www.mahalaxmifashionhub.com';
const WA = '919429429880';
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

// ── A ceiling on who may spend the key ──────────────────────────────────────
//
// This handler took a POST from anybody, with no login, no limit and no check
// on where the request came from, and spent money on every one: twelve
// messages of up to 1500 characters each, plus the whole catalogue in the
// system prompt, into a paid model. A short script pointed at it drains the
// balance, and the first person to notice is a customer whose chat has stopped
// working.
//
// A login is the wrong tool - the shopper asking about a nightie has not signed
// in and should not have to. What is cheap and right: the request has to come
// from our own pages, and one caller gets a handful of questions a minute.
//
// In memory on purpose. pm2 runs this in cluster mode, so each worker keeps its
// own count and the real ceiling is a small multiple of the number below - that
// is fine. The point is that an unbounded hole becomes a bounded one; it is not
// a billing control.
const WINDOW_MS = 60_000;
const PER_WINDOW = 8;
const asked = new Map<string, number[]>();

function tooMany(ip: string): boolean {
  const now = Date.now();
  const hits = (asked.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
  hits.push(now);
  asked.set(ip, hits);

  // The map must not grow for ever on a long-running worker.
  if (asked.size > 5000) {
    for (const [k, v] of asked) if (v.every(t => now - t >= WINDOW_MS)) asked.delete(k);
    if (asked.size > 5000) asked.clear();
  }
  return hits.length > PER_WINDOW;
}

function callerIp(req: Request): string {
  const h = req.headers;
  return (h.get('cf-connecting-ip')
    || (h.get('x-forwarded-for') ?? '').split(',')[0]
    || 'unknown').trim();
}

// Our own pages only. A browser always sends one of these on a same-origin
// fetch; a script usually sends neither, and one that forges them is at least
// being deliberate about it. Anything that is not our host is turned away.
const ALLOWED_HOSTS = new Set([
  'www.mahalaxmifashionhub.com',
  'mahalaxmifashionhub.com',
  'localhost:3000',
]);

function fromOurSite(req: Request): boolean {
  const o = req.headers.get('origin');
  const r = req.headers.get('referer');
  const src = o || r;
  if (!src) return false;
  try { return ALLOWED_HOSTS.has(new URL(src).host); } catch { return false; }
}

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };
type ApiProduct = { dbId: number; name: string; category?: string; subcategory?: string; price: number; discountPrice?: number; stock?: string };

// Fetch a compact product catalogue so the bot can recommend real items & prices.
let catalogCache: { at: number; text: string } | null = null;
async function getCatalog(): Promise<string> {
  if (catalogCache && Date.now() - catalogCache.at < 5 * 60 * 1000) return catalogCache.text;
  try {
    const r = await fetch(`${API_BASE}/products?pageSize=200`, { cache: 'no-store' });
    if (!r.ok) return '';
    const data = (await r.json()) as { products?: ApiProduct[] };
    const items = (data.products ?? [])
      .filter(p => !['Inactive', 'Draft'].includes(p.stock ?? 'In Stock'))
      .slice(0, 80)
      .map(p => {
        const price = p.discountPrice && p.discountPrice > 0 ? p.discountPrice : p.price;
        const cat = p.subcategory || p.category || '';
        return `- ${p.name} | Rs ${price}${cat ? ' | ' + cat : ''} | ${SITE}/products/${p.dbId}`;
      });
    const text = items.join('\n');
    catalogCache = { at: Date.now(), text };
    return text;
  } catch {
    return '';
  }
}

function systemPrompt(catalog: string): string {
  return [
    'You are "Laxmi", the friendly shopping assistant for Mahalaxmi Fashion Hub, an Indian online store based in Balotra, Rajasthan.',
    'You sell Fashion, Beauty and more for Men, Women & Kids — Sarees, Nighty, Petticoat, ethnic wear, beauty products and more.',
    '',
    'STORE FACTS (use these to answer):',
    '- Free shipping on orders above Rs 999. Pan-India delivery, usually 3-5 days.',
    '- Cash on Delivery (COD) available, plus UPI, Card, Net Banking.',
    '- 7-Day easy returns & exchange.',
    `- Website: ${SITE} | Track order: ${SITE}/tracking | Order help via WhatsApp: +91 9429429880.`,
    '- All products are quality-checked and genuine.',
    '',
    'HOW TO BEHAVE:',
    '- Your first message is in English. Then DETECT the language the customer writes in and ALWAYS reply in that SAME language (English, Hindi, or Hinglish). If unclear, use English. Keep replies short, warm and helpful.',
    '- When recommending products, pick from the CATALOG below and include the product link. Never invent products or prices.',
    '- If asked for something not in the catalog, say it may not be listed and offer WhatsApp for a custom request.',
    '- For order status/tracking, guide them to the Track Order page or WhatsApp.',
    `- If a query needs a human (complaints, custom orders, bulk), suggest WhatsApp: https://wa.me/${WA}.`,
    '- Never make up order details, discounts or offers that are not stated here.',
    '',
    catalog ? `CATALOG (name | price | type | link):\n${catalog}` : 'CATALOG: (temporarily unavailable — guide the customer to browse the website.)',
  ].join('\n');
}

export async function POST(req: Request) {
  if (!fromOurSite(req))
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  if (tooMany(callerIp(req)))
    return NextResponse.json({
      reply: `One moment Please ask again in a few seconds, or message us on WhatsApp: https://wa.me/${WA}`,
    }, { status: 429 });

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({
      reply: `Our live assistant is being set up For quick help, message us on WhatsApp: https://wa.me/${WA}`,
    });
  }

  let body: { messages?: ChatMessage[] };
  try { body = (await req.json()) as { messages?: ChatMessage[] }; }
  catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }

  const history = (body.messages ?? [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));

  if (history.length === 0) return NextResponse.json({ error: 'No message' }, { status: 400 });

  const catalog = await getCatalog();

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.5,
        max_tokens: 450,
        messages: [{ role: 'system', content: systemPrompt(catalog) }, ...history],
      }),
    });
    if (!resp.ok) {
      return NextResponse.json({
        reply: `Sorry, I'm having a little trouble right now Get quick help on WhatsApp: https://wa.me/${WA}`,
      });
    }
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = data.choices?.[0]?.message?.content?.trim()
      || `Sorry, I didn't quite get that Chat with us on WhatsApp: https://wa.me/${WA}`;
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({
      reply: `We're having a connection issue Please message us on WhatsApp: https://wa.me/${WA}`,
    });
  }
}
