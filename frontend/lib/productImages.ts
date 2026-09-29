// Next apne `public/` folder ki suchi SERVER SHURU HOTE WAQT ek baar banata hai.
// Uske baad jo photo upload hoti hai, Next ke liye wo maujood hi nahi hoti.
// /_next/image photo apne hi server se maangta hai, use 404 milta hai, aur pm2
// ke error log me yahi line aati hai:
//     "The requested resource isn't a valid image for /product-images/… received null"
//
// Nginx wahi file seedhe disk se pardos deta hai, isliye photo ka pata kholne par
// 200 aata hai jabki card khali rehta hai — yahi uljhan thi.
//
// Isliye product photo ka pata POORA bheja jata hai. Tab optimiser use apne andar
// se nahi, HTTP par Nginx se maangta hai, aur wahan wo hamesha milti hai — chahe
// abhi-abhi upload hui ho. next.config ke remotePatterns me yeh domain pehle se
// allowed hai.
const SITE_ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.mahalaxmifashionhub.com')
  .replace(/\/+$/, '');

export function productImageSrc(src?: string | null): string {
  const value = src?.trim();
  if (!value) return '';
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  const path = value.startsWith('/') ? value : `/${value.replace(/^\.?\//, '')}`;
  return path.startsWith('/product-images/') ? SITE_ORIGIN + path : path;
}

// The blurred backdrop behind an odd-shaped photo is blurred 18px and scaled up,
// so detail in it is invisible by construction. Asking Next's optimiser for a
// 64px copy costs about a kilobyte instead of re-downloading the full photo a
// second time — which is what a plain background-image url does.
export function productImageThumb(src: string, w = 64, q = 40): string {
  if (!src || /^(data:|blob:)/i.test(src)) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;
}
