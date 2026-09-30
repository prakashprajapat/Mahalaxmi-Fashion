import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { productsApi } from '@/lib/api';
import { productImageSrc } from '@/lib/productImages';
import { productSlug } from '@/lib/productSlug';
import { finalUnitPrice } from '@/lib/price';
import type { Product } from '@/types';

// Instagram ke bio me jo ek link jata hai, uska thikana.
//
// Reel ke caption me link chalta nahi, Story ka sticker har baar nahi lagta,
// aur bio me jagah sirf ek hai. Us ek link ko homepage par bhejne ka matlab hai
// grahak ko navbar, search, banner aur poori dukaan ke beech chhod dena — jabki
// wo aaya ek hi cheez dekhne: "jo reel me tha wo kahan hai".
//
// Isliye ye panna dukaan nahi, ek darwaza hai: bade batan, chuninda saman, aur
// WhatsApp. Shop ka header-footer yahan jaan-bujh kar nahi hai — ye (store)
// group ke bahar hai, isliye StoreChrome ise chhoota hi nahi. Kam cheezein,
// kam soch, aur agla click.
//
// Har link par ?utm_source=instagram lagta hai, taki baad me dekha ja sake ki
// Instagram se aaye log kahan gaye — bina iske wo sab "direct" me gum ho jate.

export const revalidate = 300;

export const metadata: Metadata = {
  // Layout naam dobara jod deta hai, aur 'Shop Mahalaxmi Fashion Hub |
  // Mahalaxmi Fashion Hub' Instagram ke browser me upar aisa hi dikhta hai.
  title: { absolute: 'Shop Mahalaxmi Fashion Hub' },
  description: 'Sarees, nighties, kurtis, footwear and more — order on WhatsApp or shop online. Free delivery, easy returns, cash on delivery.',
  alternates: { canonical: '/bio' },
  // Patla panna hai aur iski har cheez kahin aur bhi hai — khoj me ise dikhane
  // ki zarurat nahi, sirf Instagram se aane walon ke liye hai.
  robots: { index: false, follow: true },
};

const WHATSAPP = 'https://wa.me/919429429880';

// Play Store ka seedha link. referrer bhi saath jata hai, isliye Play Console
// me dikh jayega ki app kis rah se install hua — bina iske har install
// "organic" gin liya jata hai aur reel ka hisaab kabhi nahi milta.
const PLAY_APP =
  'https://play.google.com/store/apps/details?id=com.mahalaxmifashionhub.www.twa'
  + '&referrer=utm_source%3Dinstagram%26utm_medium%3Dbio';
const UTM = 'utm_source=instagram&utm_medium=bio&utm_campaign=link_in_bio';

const CATEGORIES: Array<{ label: string; href: string }> = [
  { label: 'Women',       href: '/women' },
  { label: 'Men',         href: '/men' },
  { label: 'Kids',        href: '/kids' },
  { label: 'Beauty',      href: '/beauty' },
  { label: 'Fabrics',     href: '/fabrics' },
  { label: 'Best Sellers', href: '/best-sellers' },
];

const track = (href: string) => `${href}${href.includes('?') ? '&' : '?'}${UTM}`;

export default async function BioPage() {
  const { products } = await productsApi
    .getAll({ bestSeller: true, pageSize: 8 })
    .catch(() => ({ products: [] as Product[] }));

  const picks = (products as Product[]).slice(0, 6);

  return (
    <main className="bio">
      <style>{`
        .bio { max-width: 34rem; margin: 0 auto; padding: 1.6rem 1rem 3rem; }
        .bio-head { text-align: center; }
        .bio-logo { border-radius: 14px; }
        .bio-name { font-size: 1.35rem; font-weight: 800; color: #4a1f27; margin: .6rem 0 .15rem; letter-spacing: .01em; }
        .bio-tag { font-size: .84rem; color: #8a7a7e; margin: 0 0 1.4rem; }
        .bio-links { display: grid; gap: .6rem; }
        .bio-btn {
          display: flex; align-items: center; justify-content: center; gap: .5rem;
          padding: .95rem 1rem; border-radius: 12px; text-decoration: none;
          font-weight: 700; font-size: .95rem; border: 1.5px solid #ecdfe2;
          background: #fff; color: #4a1f27; text-align: center;
        }
        .bio-btn.primary { background: #722f37; border-color: #722f37; color: #fff; }
        .bio-btn.whatsapp { background: #128c7e; border-color: #128c7e; color: #fff; }
        .bio-btn.app { background: #1f2a37; border-color: #1f2a37; color: #fff; }
        .bio-cats { display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem; margin-top: .6rem; }
        .bio-cat {
          padding: .7rem .4rem; border-radius: 10px; border: 1.5px solid #ecdfe2; background: #fff;
          color: #4a1f27; text-decoration: none; font-size: .82rem; font-weight: 600; text-align: center;
        }
        .bio-h2 { font-size: .78rem; letter-spacing: .12em; text-transform: uppercase; color: #8a7a7e; font-weight: 700; margin: 2rem 0 .7rem; text-align: center; }
        .bio-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .55rem; }
        .bio-card { text-decoration: none; color: inherit; display: block; }
        .bio-thumb { position: relative; aspect-ratio: 3 / 4; border-radius: 10px; overflow: hidden; background: #f4efef; }
        .bio-title { font-size: .74rem; line-height: 1.3; margin: .35rem 0 .1rem; color: #3a2b2f; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .bio-price { font-size: .8rem; font-weight: 800; color: #722f37; }
        .bio-foot { margin-top: 2rem; text-align: center; font-size: .78rem; color: #8a7a7e; line-height: 1.8; }
        @media (max-width: 380px) { .bio-cats, .bio-grid { grid-template-columns: repeat(2, 1fr); } }
      `}</style>

      <div className="bio-head">
        <Image src="/logo.webp" alt="Mahalaxmi Fashion Hub" width={84} height={84}
          className="bio-logo" priority sizes="84px" />
        <p className="bio-name">Mahalaxmi Fashion Hub</p>
        <p className="bio-tag">Every look, a new experience</p>
      </div>

      <div className="bio-links">
        <a className="bio-btn whatsapp" href={WHATSAPP} target="_blank" rel="noopener noreferrer">
          Order on WhatsApp
        </a>
        <Link className="bio-btn primary" href={track('/products')}>Shop All Products</Link>
        <a className="bio-btn app" href={PLAY_APP} target="_blank" rel="noopener noreferrer">
          Get the Android App
        </a>
        <Link className="bio-btn" href={track('/tracking')}>Track Your Order</Link>
      </div>

      <div className="bio-cats">
        {CATEGORIES.map(c => (
          <Link key={c.href} className="bio-cat" href={track(c.href)}>{c.label}</Link>
        ))}
      </div>

      {picks.length > 0 && (
        <>
          <p className="bio-h2">Best Sellers</p>
          <div className="bio-grid">
            {picks.map(p => {
              const img = productImageSrc(p.image);
              return (
                <Link key={p.dbId} className="bio-card" href={track(`/products/${productSlug(p.name, p.dbId)}`)}>
                  <div className="bio-thumb">
                    {img && (
                      <Image src={img} alt={p.name} fill sizes="(max-width: 380px) 45vw, 30vw"
                        style={{ objectFit: 'cover' }} />
                    )}
                  </div>
                  <p className="bio-title">{p.name}</p>
                  <p className="bio-price">₹{finalUnitPrice(p).toLocaleString('en-IN')}</p>
                </Link>
              );
            })}
          </div>
        </>
      )}

      <div className="bio-foot">
        Free delivery · Easy returns · Cash on delivery<br />
        Balotra, Rajasthan · +91 94294 29880
      </div>
    </main>
  );
}
