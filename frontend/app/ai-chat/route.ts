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
      .filter(p => (p.stock ?? 'In Stock') !== 'Inactive')
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
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({
      reply: `Our live assistant is being set up 🙏 For quick help, message us on WhatsApp: https://wa.me/${WA}`,
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
        reply: `Sorry, I'm having a little trouble right now 🙏 Get quick help on WhatsApp: https://wa.me/${WA}`,
      });
    }
    const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = data.choices?.[0]?.message?.content?.trim()
      || `Sorry, I didn't quite get that 🙏 Chat with us on WhatsApp: https://wa.me/${WA}`;
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({
      reply: `We're having a connection issue 🙏 Please message us on WhatsApp: https://wa.me/${WA}`,
    });
  }
}
