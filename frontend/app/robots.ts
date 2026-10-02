import { MetadataRoute } from 'next';
import { settingsApi } from '@/lib/api';

// Refresh hourly so admin-edited robots rules take effect without a rebuild.
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Admin can add extra Disallow paths from Settings → "SEO — Verification, Analytics & Robots".
  let extra: string[] = [];
  try {
    const { settings } = await settingsApi.getAll();
    const raw = settings?.robotsDisallow ?? '';
    extra = raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  } catch {
    // ignore — fall back to defaults
  }

  // Only what should never be fetched at all. The transactional pages are NOT
  // listed: each carries robots noindex in its own layout, and a Disallow here
  // would stop Google fetching the page and so stop it ever seeing that
  // noindex — the page stays in the index, just without a description. A
  // stale public/robots.txt used to shadow this file entirely, which is why
  // the live rules said "/cart/" with a trailing slash the routes never had,
  // matched nothing, and why the Settings robots box never did anything.
  const disallow = Array.from(new Set([
    '/admin', '/api/',
    ...extra,
  ]));

  // AI wale crawler ab naam se likhe hain.
  //
  // Pehle inka koi zikr hi nahi tha. Chhup kar sab chal to rahe the (kyunki *
  // sabko ijazat deta hai), par likha kuch nahi tha — matlab kal agar kisi ne
  // * me ek Disallow jod diya to ChatGPT, Perplexity aur Google ke AI jawab
  // dukaan ko dekhna hi band kar dete, aur kisi ko pata bhi na chalta.
  //
  // Ye wo crawler hain jo jawab me dukaan ka NAAM LEKAR hawala dete hain.
  // Inhe ijazat dene ka seedha fayda hai: AI ke jawab me dukaan ka naam aata
  // hai. Inhe alag group me rakha hai taki upar wale niyam se ye kabhi
  // galti se na ruk jayein.
  const aiSearchBots = [
    'OAI-SearchBot',    // ChatGPT ka search
    'ChatGPT-User',     // jab koi ChatGPT me link kholta hai
    'GPTBot',           // OpenAI
    'PerplexityBot',
    'Perplexity-User',
    'ClaudeBot',
    'Claude-SearchBot',
    'Claude-User',
    'Google-Extended',  // Gemini / AI Overviews
    'Applebot-Extended',
    'meta-externalagent',
    'Amazonbot',
    'Bingbot',
    'DuckAssistBot',
    'cohere-ai',
    'YouBot',
  ];

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      // Wahi pabandiyan, bas naam se — /admin aur /api dukaan ka andar ka
      // hissa hai, wo inke liye bhi band hai.
      ...aiSearchBots.map(ua => ({ userAgent: ua, allow: '/', disallow })),
    ],
    sitemap: 'https://www.mahalaxmifashionhub.com/sitemap.xml',
  };
}
